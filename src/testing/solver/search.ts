import type { LevelDefinition, PlayerInput, SimState, TemporalLoop } from '../../engine/contracts';
import { Fnv1a } from '../../engine/simulation/hash';
import {
  buildVocabulary,
  runStep,
  stepLabel,
  type Ghost,
  type MacroStep,
  type StepContext,
  type StepStatus,
  type Vocabulary,
  type VocabularyOptions,
} from './macros';
import { NavGraph } from './navigation';
import { SolverWorld, loopFromInputs } from './world';

/**
 * BOUNDED MACRO SEARCH over the authoritative simulation.
 *
 * A candidate solution is: E echo loops (recorded in order, each in the world of the loops before it, exactly as a
 * player records them), then a final run that must reach the exit. Every loop is a sequence of at most
 * `echoSteps` (echo) or `finalSteps` (final, before the exit task) macro steps drawn from the level's Vocabulary.
 * The search is a depth-first enumeration of all such sequences, sharing simulation prefixes by cloning states at
 * step boundaries. Within these bounds it is EXHAUSTIVE (unless the time budget runs out, which the result
 * reports), so "no solution found" is a proof relative to the documented vocabulary — not an absolute proof.
 *
 * Pruning is sound with respect to the bounds:
 *  - a wait that is already satisfied is a duplicate of the same task without the wait;
 *  - a wait that can never be satisfied (world still, echoes finished) adds nothing;
 *  - two echo plans that produce the identical input sequence are the same echo;
 *  - in the final run, two branches reaching the identical world state (full hash) at the same depth have the same
 *    futures (the final run is the last actor: nothing replays it).
 */

export interface SearchBounds {
  /** Number of echo loops recorded before the final run. */
  echoes: number;
  /** Max macro steps per echo loop. */
  echoSteps: number;
  /** Max macro steps in the final run before its exit task. */
  finalSteps: number;
  vocab?: VocabularyOptions;
  /** Ticks a blocked live navigator keeps pushing before giving up. default 240 */
  blindPatience?: number;
  /** Final run: ticks after the last echo finished before the exit task gives up. default 600 */
  finalGrace?: number;
  /** Cap on any loop's length. default level.loopDurationTicks */
  maxLoopTicks?: number;
  /** Allow the (fixed) final waits before the exit task of the final run. default true */
  exitWaits?: boolean;
}

export interface SearchOptions {
  budgetMs?: number;
  /** Stop after this many accepted solutions. default 1 */
  maxSolutions?: number;
  /** Only explore top-level branches with index % count === index (parallel workers). */
  shard?: { index: number; count: number };
  /** Filter: only solutions for which this returns true are collected (e.g. "violates the teaching goal"). */
  accept?: (s: FoundSolution) => boolean;
}

export interface FoundLoop {
  steps: string[];
  loop: TemporalLoop;
}

export interface FoundSolution {
  levelId: string;
  echoes: FoundLoop[];
  final: { steps: string[]; inputs: PlayerInput[] };
  completedAtTick: number;
}

export interface SearchStats {
  nodes: number;
  ticks: number;
  echoPlans: number[];
  finalRuns: number;
  elapsedMs: number;
}

export interface SearchResult {
  levelId: string;
  bounds: SearchBounds;
  solutions: FoundSolution[];
  /** True when every candidate within the bounds was examined (no budget cut, no early stop). */
  exhaustive: boolean;
  stoppedEarly: boolean;
  budgetExceeded: boolean;
  stats: SearchStats;
  /** Size of the per-step option set (tasks x waits) — part of the documented bounds. */
  vocabSize: { tasks: number; waits: number };
}

const PRUNED: ReadonlySet<StepStatus> = new Set(['redundant', 'never', 'invalid', 'timeUp']);

function inputsHash(inputs: readonly PlayerInput[]): number {
  const h = new Fnv1a();
  for (const p of inputs) h.num((p.moveX + 1) * 9 + (p.moveY + 1) * 3 + (p.interactPressed ? 1 : 0) + (p.actionPressed ? 27 : 0));
  h.num(inputs.length);
  return h.digest();
}

interface Node {
  state: SimState;
  inputs: PlayerInput[];
  steps: string[];
  ghost: Ghost;
}

export class MacroSearch {
  readonly graph: NavGraph;
  readonly vocab: Vocabulary;
  private readonly bounds: Required<Omit<SearchBounds, 'vocab'>> & { vocab: VocabularyOptions };
  private solutions: FoundSolution[] = [];
  private stats: SearchStats = { nodes: 0, ticks: 0, echoPlans: [], finalRuns: 0, elapsedMs: 0 };
  private deadline = Infinity;
  private budgetExceeded = false;
  private stopped = false;
  private opts: SearchOptions = {};
  private echoOptions: MacroStep[] = [];
  private finalOptions: MacroStep[] = [];
  private exitOptions: MacroStep[] = [];

  constructor(
    readonly level: LevelDefinition,
    bounds: SearchBounds,
  ) {
    this.bounds = {
      echoes: bounds.echoes,
      echoSteps: bounds.echoSteps,
      finalSteps: bounds.finalSteps,
      vocab: bounds.vocab ?? {},
      blindPatience: bounds.blindPatience ?? 240,
      finalGrace: bounds.finalGrace ?? 600,
      maxLoopTicks: bounds.maxLoopTicks ?? level.loopDurationTicks,
      exitWaits: bounds.exitWaits ?? true,
    };
    this.graph = new NavGraph(level);
    this.vocab = buildVocabulary(level, this.bounds.vocab);
    for (const task of [...this.vocab.tasks, ...this.vocab.blindTasks]) for (const w of this.vocab.waits) this.echoOptions.push({ wait: w, task });
    for (const task of this.vocab.tasks) for (const w of this.vocab.finalWaits) this.finalOptions.push({ wait: w, task });
    this.exitOptions = (this.bounds.exitWaits ? this.vocab.finalWaits : this.vocab.finalWaits.slice(0, 1)).map((w) => ({ wait: w, task: this.vocab.exit }));
  }

  run(opts: SearchOptions = {}): SearchResult {
    this.opts = opts;
    this.solutions = [];
    this.stats = { nodes: 0, ticks: 0, echoPlans: Array.from({ length: this.bounds.echoes }, () => 0), finalRuns: 0, elapsedMs: 0 };
    this.budgetExceeded = false;
    this.stopped = false;
    const t0 = Date.now();
    this.deadline = opts.budgetMs !== undefined ? t0 + opts.budgetMs : Infinity;
    if (this.bounds.echoes === 0) this.searchFinal([], true);
    else this.searchEcho(0, []);
    this.stats.elapsedMs = Date.now() - t0;
    return {
      levelId: this.level.id,
      bounds: { ...this.bounds },
      solutions: this.solutions,
      exhaustive: !this.budgetExceeded && !this.stopped,
      stoppedEarly: this.stopped,
      budgetExceeded: this.budgetExceeded,
      stats: this.stats,
      vocabSize: { tasks: this.vocab.tasks.length, waits: this.vocab.waits.length },
    };
  }

  private halted(): boolean {
    if (this.stopped || this.budgetExceeded) return true;
    if ((this.stats.nodes & 15) === 0 && Date.now() > this.deadline) this.budgetExceeded = true;
    return this.budgetExceeded;
  }

  private ctx(world: SolverWorld): StepContext {
    return {
      world,
      graph: this.graph,
      maxTicks: this.bounds.maxLoopTicks,
      blindPatience: this.bounds.blindPatience,
      finalGrace: this.bounds.finalGrace,
    };
  }

  private inShard(topLevel: boolean, i: number): boolean {
    const s = this.opts.shard;
    return !topLevel || !s || s.count <= 1 || i % s.count === s.index;
  }

  /* ---------------------------------------------------------------------------------------------------------- */

  private searchEcho(loopIdx: number, committed: FoundLoop[]): void {
    const world = new SolverWorld(
      this.level,
      committed.map((c) => c.loop),
    );
    const ctx = this.ctx(world);
    const seen = new Set<number>();
    const dfs = (node: Node, depth: number): void => {
      for (let i = 0; i < this.echoOptions.length; i++) {
        if (this.halted()) return;
        if (!this.inShard(loopIdx === 0 && depth === 0, i)) continue;
        const step = this.echoOptions[i]!;
        const st = world.clone(node.state);
        const inputs = node.inputs.slice();
        const t0 = st.tick;
        const { status, ghost } = runStep(ctx, st, inputs, step, node.ghost);
        this.stats.nodes++;
        this.stats.ticks += st.tick - t0;
        if (PRUNED.has(status) || status === 'complete') continue;
        const key = inputsHash(inputs);
        if (seen.has(key)) continue;
        seen.add(key);
        const steps = [...node.steps, stepLabel(step)];
        this.stats.echoPlans[loopIdx]! += 1;
        const loop = loopFromInputs(loopIdx + 1, inputs);
        const next = [...committed, { steps, loop }];
        if (loopIdx + 1 < this.bounds.echoes) this.searchEcho(loopIdx + 1, next);
        else this.searchFinal(next, false);
        if (depth + 1 < this.bounds.echoSteps) dfs({ state: st, inputs, steps, ghost }, depth + 1);
      }
    };
    dfs({ state: world.initial(), inputs: [], steps: [], ghost: null }, 0);
  }

  private searchFinal(committed: FoundLoop[], topLevel: boolean): void {
    const world = new SolverWorld(
      this.level,
      committed.map((c) => c.loop),
    );
    const ctx = this.ctx(world);
    const memo = new Set<number>();
    this.stats.finalRuns++;
    const tryExit = (node: Node): void => {
      for (const step of this.exitOptions) {
        if (this.halted()) return;
        const st = world.clone(node.state);
        const inputs = node.inputs.slice();
        const t0 = st.tick;
        const { status } = runStep(ctx, st, inputs, step, null);
        this.stats.nodes++;
        this.stats.ticks += st.tick - t0;
        if (status === 'complete') this.found(committed, [...node.steps, stepLabel(step)], inputs, st.completedAtTick ?? st.tick);
      }
    };
    const dfs = (node: Node, depth: number): void => {
      tryExit(node);
      if (depth >= this.bounds.finalSteps) return;
      for (let i = 0; i < this.finalOptions.length; i++) {
        if (this.halted()) return;
        if (!this.inShard(topLevel && depth === 0, i)) continue;
        const step = this.finalOptions[i]!;
        const st = world.clone(node.state);
        const inputs = node.inputs.slice();
        const t0 = st.tick;
        const { status } = runStep(ctx, st, inputs, step, null);
        this.stats.nodes++;
        this.stats.ticks += st.tick - t0;
        const steps = [...node.steps, stepLabel(step)];
        if (status === 'complete') {
          this.found(committed, steps, inputs, st.completedAtTick ?? st.tick);
          continue;
        }
        if (PRUNED.has(status)) continue;
        const key = (world.hash(st) ^ Math.imul(depth + 1, 0x9e3779b1)) >>> 0;
        if (memo.has(key)) continue;
        memo.add(key);
        dfs({ state: st, inputs, steps, ghost: null }, depth + 1);
      }
    };
    // Shard the final run only when there are no echoes to shard on; the exit-from-root attempt runs in shard 0.
    if (topLevel && this.opts.shard && this.opts.shard.count > 1 && this.opts.shard.index !== 0) {
      const root = { state: world.initial() };
      if (this.bounds.finalSteps > 0) {
        // replicate dfs(depth 0) without the root exit attempt
        for (let i = 0; i < this.finalOptions.length; i++) {
          if (this.halted()) return;
          if (!this.inShard(true, i)) continue;
          const step = this.finalOptions[i]!;
          const st = world.clone(root.state);
          const inputs: PlayerInput[] = [];
          const t0 = st.tick;
          const { status } = runStep(ctx, st, inputs, step, null);
          this.stats.nodes++;
          this.stats.ticks += st.tick - t0;
          const steps = [stepLabel(step)];
          if (status === 'complete') {
            this.found(committed, steps, inputs, st.completedAtTick ?? st.tick);
            continue;
          }
          if (PRUNED.has(status)) continue;
          dfs({ state: st, inputs, steps, ghost: null }, 1);
        }
      }
      return;
    }
    dfs({ state: world.initial(), inputs: [], steps: [], ghost: null }, 0);
  }

  private found(committed: FoundLoop[], steps: string[], inputs: PlayerInput[], completedAtTick: number): void {
    const sol: FoundSolution = {
      levelId: this.level.id,
      echoes: committed,
      final: { steps, inputs },
      completedAtTick,
    };
    if (this.opts.accept && !this.opts.accept(sol)) return;
    this.solutions.push(sol);
    if (this.solutions.length >= (this.opts.maxSolutions ?? 1)) this.stopped = true;
  }
}

export function search(level: LevelDefinition, bounds: SearchBounds, opts: SearchOptions = {}): SearchResult {
  return new MacroSearch(level, bounds).run(opts);
}
