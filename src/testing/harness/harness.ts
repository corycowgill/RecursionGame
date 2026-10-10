import type { InputScript, LevelDefinition, PlayerInput, SimEvent, TemporalLoop } from '../../engine/contracts';
import { IDLE_INPUT } from '../../engine/contracts';
import type { EntityRegistry } from '../../engine/simulation/registry';
import { TemporalGame } from '../../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../../gameplay/entities';
import { ScriptRunner } from './script';

/**
 * HEADLESS HARNESS — runs levels without a browser: scripted loops, echo replay, completion checks and
 * per-tick world hashes for determinism comparisons. Used by Vitest and by future bots/fuzzers.
 */

export interface HarnessOptions {
  registry?: EntityRegistry;
  /** Record game.hash() after every tick of each pass. default true */
  recordHashes?: boolean;
  /** Hard cap on ticks per pass. default level.loopDurationTicks */
  maxTicks?: number;
  snapshotInterval?: number;
}

export interface PassResult {
  /** Inputs the player produced in this pass (becomes the loop if committed). */
  inputs: PlayerInput[];
  /** hashes[i] = world hash after tick i. */
  hashes: number[];
  events: SimEvent[];
  completed: boolean;
  completedAtTick: number | null;
  timedOut: boolean;
  finalHash: number;
}

export interface SolutionResult {
  completed: boolean;
  completedAtTick: number | null;
  /** Committed echo loops followed by the final player run as a TemporalLoop. */
  loops: TemporalLoop[];
  passes: PassResult[];
  game: TemporalGame;
}

export function createGame(level: LevelDefinition, opts: HarnessOptions = {}): TemporalGame {
  const game = new TemporalGame(opts.registry ?? createDefaultRegistry(), {
    trackPrevious: false,
    snapshotInterval: opts.snapshotInterval ?? 30,
  });
  game.loadLevel(level);
  return game;
}

function finishPass(game: TemporalGame, inputs: PlayerInput[], hashes: number[], events: SimEvent[], timedOut: boolean): PassResult {
  const st = game.getState();
  return {
    inputs,
    hashes,
    events,
    completed: st.status === 'complete',
    completedAtTick: st.completedAtTick,
    timedOut,
    finalHash: game.hash(),
  };
}

/**
 * Plays an InputScript live in the game's current pass (closed loop). Stops when the script ends, the level
 * completes, or the pass can no longer advance. Does NOT commit/rewind.
 */
export function playScript(game: TemporalGame, script: InputScript, opts: HarnessOptions = {}): PassResult {
  const runner = new ScriptRunner(script);
  const record = opts.recordHashes !== false;
  const max = opts.maxTicks ?? game.level.loopDurationTicks;
  const inputs: PlayerInput[] = [];
  const hashes: number[] = [];
  const events: SimEvent[] = [];
  while (game.getState().tick < max) {
    const input = runner.next(game.getState());
    if (!input) break;
    const r = game.step(input);
    if (!r.advanced) break;
    inputs.push(input);
    for (const e of r.events) events.push(e);
    if (record) hashes.push(game.hash());
    if (game.getState().status !== 'playing') break;
  }
  return finishPass(game, inputs, hashes, events, runner.timedOut !== null);
}

/** Plays raw inputs (open loop) in the current pass; idles after they run out until `totalTicks` if given. */
export function playInputs(game: TemporalGame, seq: readonly PlayerInput[], totalTicks?: number, opts: HarnessOptions = {}): PassResult {
  const record = opts.recordHashes !== false;
  const n = totalTicks ?? seq.length;
  const inputs: PlayerInput[] = [];
  const hashes: number[] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const input = seq[i] ?? { ...IDLE_INPUT, tick: i };
    const r = game.step(input);
    if (!r.advanced) break;
    inputs.push(input);
    for (const e of r.events) events.push(e);
    if (record) hashes.push(game.hash());
    if (game.getState().status !== 'playing') break;
  }
  return finishPass(game, inputs, hashes, events, false);
}

/**
 * Runs a level's InputScript solution: every script but the last is played and committed as an echo; the last
 * is the final player run. Returns completion, the compiled TemporalLoops and per-pass hashes.
 */
export function runScripts(level: LevelDefinition, scripts: readonly InputScript[], opts: HarnessOptions = {}): SolutionResult {
  const game = createGame(level, opts);
  const passes: PassResult[] = [];
  const loops: TemporalLoop[] = [];
  scripts.forEach((script, i) => {
    const pass = playScript(game, script, opts);
    passes.push(pass);
    if (i < scripts.length - 1) {
      if (!game.commitLoopAndRewind()) throw new Error(`runScripts: could not commit loop ${i} (echo limit?)`);
      const committed = game.getLoops()[game.getLoops().length - 1];
      if (committed) loops.push(committed);
    } else {
      loops.push({ id: -1, durationTicks: pass.inputs.length, inputs: pass.inputs, outcomes: [] });
    }
  });
  const last = passes[passes.length - 1];
  return {
    completed: last?.completed ?? false,
    completedAtTick: last?.completedAtTick ?? null,
    loops,
    passes,
    game,
  };
}

export function runSolution(level: LevelDefinition, opts: HarnessOptions = {}): SolutionResult {
  return runScripts(level, level.solution, opts);
}

/** Compiles a level's InputScript solution into concrete TemporalLoops (echoes..., final run). */
export function compileSolution(level: LevelDefinition, opts: HarnessOptions = {}): TemporalLoop[] {
  return runSolution(level, opts).loops;
}

/**
 * Replays concrete loops: `echoes` are installed via setLoops and `finalInputs` drive the player.
 * This is the pure re-simulation path (no scripts, no live recording decisions).
 */
export function replayLoops(
  level: LevelDefinition,
  echoes: readonly TemporalLoop[],
  finalInputs: readonly PlayerInput[],
  opts: HarnessOptions & { totalTicks?: number } = {},
): PassResult & { game: TemporalGame } {
  const game = createGame(level, opts);
  game.setLoops(echoes);
  const pass = playInputs(game, finalInputs, opts.totalTicks, opts);
  return { ...pass, game };
}

/** Compares two hash sequences; returns the first differing tick index or -1 when identical. */
export function firstHashMismatch(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export interface LevelVerification {
  ok: boolean;
  levelId: string;
  completedAtTick: number | null;
  echoesUsed: number;
  reason?: string;
}

/** Machine-verifiable win check for a level's known solution (used by level tests and CI). */
export function verifyLevelSolution(level: LevelDefinition, opts: HarnessOptions = {}): LevelVerification {
  try {
    const res = runSolution(level, opts);
    const echoesUsed = Math.max(0, level.solution.length - 1);
    if (echoesUsed > level.maxEchoes)
      return { ok: false, levelId: level.id, completedAtTick: null, echoesUsed, reason: 'solution exceeds maxEchoes' };
    if (!res.completed) {
      const last = res.passes[res.passes.length - 1];
      return {
        ok: false,
        levelId: level.id,
        completedAtTick: null,
        echoesUsed,
        reason: last?.timedOut ? 'a moveTo step timed out' : 'final run did not reach the exit',
      };
    }
    return { ok: true, levelId: level.id, completedAtTick: res.completedAtTick, echoesUsed };
  } catch (err) {
    return { ok: false, levelId: level.id, completedAtTick: null, echoesUsed: 0, reason: String(err) };
  }
}
