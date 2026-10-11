import { PHYS, UNITS_PER_TILE, fdiv, type LevelDefinition, type PlayerInput, type SimState } from '../../engine/contracts';
import { MOVE_TO_TOLERANCE } from '../harness/script';
import { NavGraph, type NavCell } from './navigation';
import { makeInput, type SolverWorld } from './world';

/**
 * MACRO ACTIONS — the solver's vocabulary. A loop (echo or final run) is a short sequence of MacroSteps; each step
 * is "optionally wait for something, then do one task". A step compiles into per-tick PlayerInputs against the
 * live simulation, like a human with a plan:
 *
 *   wait   none | N ticks | until entity X's signal becomes on/off
 *   task   go(cell)        walk to a cell centre and stop there (stand on a plate, in a doorway, on a lift ...)
 *          press(entity)   walk next to a console, face it, press {interact}
 *          pick(entity)    walk next to a crate / energy cell, face it, pick it up
 *          drop(cell)      walk next to a cell, face it, put the carried item down (or into a socket)
 *          hold            do nothing (a step that is only its wait: "when the ferry docks again, ...")
 *          exit            (final run only) walk to the exit portal and keep trying until the world goes still
 *
 * Two ways to walk (echo loops may use both; the final run is always live):
 *   live   closed loop against the real position, along the optimistic static path (navigation.ts). Something shut
 *          in the way is pushed into for `blindPatience` ticks; press / pick / drop tasks press {interact} once a
 *          second while blocked. Like the hand-written solutions' moveTo + timeout.
 *   blind  dead reckoning against a GHOST position that walks the optimistic path as if every door were open. The
 *          inputs are what a human would press if the way were clear; in the recording world they may achieve
 *          nothing (pushing into a shut door), and replayed in a world that later loops opened they carry the echo
 *          exactly where the plan said (the Level 7 / 9 / 10 "blind recording" mechanic). The ghost carries over to
 *          the next blind step, so multi-leg blind routes stay consistent.
 */

export type TaskKind = 'go' | 'press' | 'pick' | 'drop' | 'hold' | 'exit';

export type Task =
  | { kind: 'go'; cell: NavCell; tag: string; blind?: boolean }
  | { kind: 'press'; entity: string; tag: string; blind?: boolean }
  | { kind: 'pick'; entity: string; tag: string; blind?: boolean }
  | { kind: 'drop'; cell: NavCell; tag: string; blind?: boolean }
  | { kind: 'hold'; tag: string; blind?: boolean }
  | { kind: 'exit'; cell: NavCell; tag: string };

export type Wait = { kind: 'none' } | { kind: 'ticks'; n: number } | { kind: 'signal'; id: string; value: boolean };

export interface MacroStep {
  wait: Wait;
  task: Task;
}

/** Assumed position of a blind walker (units), or null = use the real position. */
export type Ghost = { x: number; z: number } | null;

export type StepStatus =
  /** Task finished as planned. */
  | 'done'
  /** Gave up after pushing into something shut for `blindPatience` ticks (inputs are still recorded). */
  | 'aborted'
  /** The wait was already satisfied: identical to the same task with no wait (pruned as a duplicate). */
  | 'redundant'
  /** The awaited signal never came (world went still, or the loop ran out). */
  | 'never'
  /** Task makes no sense here (nothing to drop, item held by someone else, no route, already there). */
  | 'invalid'
  /** The level completed during this step (final run). */
  | 'complete'
  /** The loop's time ran out. */
  | 'timeUp';

export interface StepContext {
  world: SolverWorld;
  graph: NavGraph;
  /** Hard cap on the loop's length in ticks. */
  maxTicks: number;
  /** Ticks a blocked live navigator keeps pushing before giving up (echo steps). */
  blindPatience: number;
  /** Final run: ticks after the echoes' last active input before the exit task gives up. */
  finalGrace: number;
}

export function waitLabel(w: Wait): string {
  switch (w.kind) {
    case 'none':
      return '';
    case 'ticks':
      return `+${w.n}t `;
    case 'signal':
      return `when ${w.id}=${w.value ? 'on' : 'off'} `;
  }
}

export function stepLabel(s: MacroStep): string {
  return `${waitLabel(s.wait)}${s.task.tag}`;
}

export function cellOfPos(x: number, z: number): NavCell {
  return { col: fdiv(x, UNITS_PER_TILE), row: fdiv(z, UNITS_PER_TILE) };
}

const QUIESCENCE_SAMPLE = 15;

function ended(st: SimState): StepStatus | null {
  if (st.status === 'playing') return null;
  return st.status === 'complete' ? 'complete' : 'timeUp';
}

function push(ctx: StepContext, st: SimState, out: PlayerInput[], mx: -1 | 0 | 1, mz: -1 | 0 | 1, e = false): void {
  const inp = makeInput(st.tick, mx, mz, e);
  ctx.world.step(st, inp);
  out.push(inp);
}

/** Idles until `pred` holds. 'never' when the world went still (echoes done) or the loop ran out first. */
function idleUntil(ctx: StepContext, st: SimState, out: PlayerInput[], pred: (s: SimState) => boolean): StepStatus {
  let lastFp = -1;
  const start = st.tick;
  while (!pred(st)) {
    const end = ended(st);
    if (end) return end;
    if (st.tick >= ctx.maxTicks) return 'never';
    if ((st.tick - start) % QUIESCENCE_SAMPLE === 0) {
      const fp = ctx.world.motionFingerprint(st);
      if (fp === lastFp && st.tick >= ctx.world.echoesActiveEndTick) return 'never';
      lastFp = fp;
    }
    push(ctx, st, out, 0, 0);
  }
  return 'done';
}

function idleTicks(ctx: StepContext, st: SimState, out: PlayerInput[], n: number): StepStatus {
  for (let i = 0; i < n; i++) {
    const end = ended(st);
    if (end) return end;
    if (st.tick >= ctx.maxTicks) return 'timeUp';
    push(ctx, st, out, 0, 0);
  }
  return 'done';
}

function facingDelta(f: 0 | 1 | 2 | 3): [-1 | 0 | 1, -1 | 0 | 1] {
  return f === 0 ? [0, -1] : f === 1 ? [1, 0] : f === 2 ? [0, 1] : [-1, 0];
}

function steer(fromX: number, fromZ: number, cell: NavCell): [-1 | 0 | 1, -1 | 0 | 1] {
  const dx = cell.col * 1000 + 500 - fromX;
  const dz = cell.row * 1000 + 500 - fromZ;
  return [Math.abs(dx) > MOVE_TO_TOLERANCE ? (Math.sign(dx) as -1 | 1) : 0, Math.abs(dz) > MOVE_TO_TOLERANCE ? (Math.sign(dz) as -1 | 1) : 0];
}

interface Route {
  path: NavCell[];
  wps: NavCell[];
  wpIdx: number[];
  nominal: number;
}

function route(g: NavGraph, from: NavCell, to: NavCell): Route | null {
  const path = g.path(from, to);
  if (!path) return null;
  const wps = g.waypoints(path);
  const wpIdx: number[] = [];
  let k = 0;
  for (const w of wps) {
    while (k < path.length && (path[k]!.col !== w.col || path[k]!.row !== w.row)) k++;
    wpIdx.push(k);
  }
  return { path, wps, wpIdx, nominal: g.pathTicks(path) };
}

type NavStatus = 'arrived' | 'aborted' | 'invalid' | 'complete' | 'timeUp';

/**
 * Live (closed-loop) navigation to the centre of `goal`. `final` = exit-task patience (until the echoes' last
 * active input + finalGrace, or until the world is still while we are blocked). `mash` presses {interact} once a
 * second while blocked.
 */
function navigateLive(ctx: StepContext, st: SimState, out: PlayerInput[], goal: NavCell, final: boolean, mash: boolean): NavStatus {
  const me0 = ctx.world.player(st);
  const r = route(ctx.graph, cellOfPos(me0.x, me0.z), goal);
  if (!r) return 'invalid';
  const { path, wps, wpIdx } = r;
  const start = st.tick;
  const deadline = final ? Infinity : start + r.nominal + ctx.blindPatience;
  let wi = wps.length > 1 ? 1 : 0;
  let lastX = me0.x;
  let lastZ = me0.z;
  let blocked = 0;
  let lastFp = -1;
  for (;;) {
    const end = ended(st);
    if (end) return end === 'complete' ? 'complete' : 'timeUp';
    if (st.tick >= ctx.maxTicks) return 'timeUp';
    const me = ctx.world.player(st);
    // skip waypoints already overtaken (riding a deck or lift can carry us past one)
    const here = cellOfPos(me.x, me.z);
    let hereIdx = -1;
    for (let k = wpIdx[Math.max(0, wi - 1)] ?? 0; k < path.length; k++)
      if (path[k]!.col === here.col && path[k]!.row === here.row) {
        hereIdx = k;
        break;
      }
    while (wi < wps.length - 1 && hereIdx > wpIdx[wi]!) wi++;
    const [mx, mz] = steer(me.x, me.z, wps[wi]!);
    if (mx === 0 && mz === 0) {
      if (wi >= wps.length - 1) return 'arrived';
      wi++;
      continue;
    }
    if (st.tick >= deadline) return 'aborted';
    if (final && (st.tick - start) % QUIESCENCE_SAMPLE === 0) {
      const fp = ctx.world.motionFingerprint(st);
      const echoesIdle = st.tick >= ctx.world.echoesActiveEndTick;
      if (echoesIdle && fp === lastFp && blocked > 0) return 'aborted';
      if (st.tick >= ctx.world.echoesActiveEndTick + ctx.finalGrace) return 'aborted';
      lastFp = fp;
    }
    push(ctx, st, out, mx, mz, mash && blocked >= 20 && blocked % 60 === 20);
    const after = ctx.world.player(st);
    blocked = after.x === lastX && after.z === lastZ ? blocked + 1 : 0;
    lastX = after.x;
    lastZ = after.z;
  }
}

/** Blind (dead-reckoned) walk of the ghost to the centre of `goal`; the real actor gets the same inputs. */
function navigateBlind(ctx: StepContext, st: SimState, out: PlayerInput[], ghost: { x: number; z: number }, goal: NavCell): NavStatus {
  const r = route(ctx.graph, cellOfPos(ghost.x, ghost.z), goal);
  if (!r) return 'invalid';
  let wi = r.wps.length > 1 ? 1 : 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const end = ended(st);
    if (end) return end === 'complete' ? 'complete' : 'timeUp';
    if (st.tick >= ctx.maxTicks) return 'timeUp';
    const [mx, mz] = steer(ghost.x, ghost.z, r.wps[wi]!);
    if (mx === 0 && mz === 0) {
      if (wi >= r.wps.length - 1) return 'arrived';
      wi++;
      continue;
    }
    push(ctx, st, out, mx, mz);
    const sp = mx !== 0 && mz !== 0 ? PHYS.ACTOR_SPEED_DIAG : PHYS.ACTOR_SPEED;
    ghost.x += mx * sp;
    ghost.z += mz * sp;
  }
  return 'invalid';
}

export interface StepResult {
  status: StepStatus;
  ghost: Ghost;
}

/** Runs one macro step on `st` (mutated), appending the inputs it produced to `out`. */
export function runStep(ctx: StepContext, st: SimState, out: PlayerInput[], step: MacroStep, ghostIn: Ghost): StepResult {
  const t = step.task;
  const blind = t.kind !== 'exit' && t.blind === true;
  const res = (status: StepStatus, ghost: Ghost = null): StepResult => ({ status, ghost });

  if (t.kind === 'hold' && step.wait.kind === 'none') return res('invalid');
  // ---- wait phase
  const w = step.wait;
  if (w.kind === 'ticks') {
    const r = idleTicks(ctx, st, out, w.n);
    if (r !== 'done') return res(r);
  } else if (w.kind === 'signal') {
    const pred = (s: SimState): boolean => (s.signals[w.id] === true) === w.value;
    if (pred(st)) return res('redundant');
    const r = idleUntil(ctx, st, out, pred);
    if (r !== 'done') return res(r);
  }
  const end0 = ended(st);
  if (end0) return res(end0);

  // ---- task phase
  if (t.kind === 'hold') return res('done', ghostIn);
  const me = ctx.world.player(st);
  const ghost = blind ? (ghostIn ? { ...ghostIn } : { x: me.x, z: me.z }) : null;
  const pos = ghost ?? { x: me.x, z: me.z };
  const here = cellOfPos(pos.x, pos.z);

  if (t.kind === 'go' || t.kind === 'exit') {
    if (t.kind === 'go' && here.col === t.cell.col && here.row === t.cell.row) return res('invalid'); // already there
    const r = ghost ? navigateBlind(ctx, st, out, ghost, t.cell) : navigateLive(ctx, st, out, t.cell, t.kind === 'exit', false);
    if (r === 'arrived') return res(st.status === 'complete' ? 'complete' : 'done', ghost);
    return res(r, ghost);
  }

  let target: NavCell;
  if (t.kind === 'drop') {
    if (me.carrying === null && !blind) return res('invalid');
    target = t.cell;
  } else {
    const e = st.entities[t.entity];
    if (!e) return res('invalid');
    if (t.kind === 'pick' && !blind && (me.carrying !== null || e.carriedBy !== null)) return res('invalid');
    target = cellOfPos(e.x, e.z);
  }
  let best: { cell: NavCell; facing: 0 | 1 | 2 | 3 } | null = null;
  let bestT = Infinity;
  for (const a of ctx.graph.approachCells(target)) {
    const d = ctx.graph.ticksBetween(here, a.cell);
    if (d < bestT) {
      bestT = d;
      best = a;
    }
  }
  if (!best) return res('invalid');
  const cx = best.cell.col * 1000 + 500;
  const cz = best.cell.row * 1000 + 500;
  const atApproach = Math.abs(pos.x - cx) <= MOVE_TO_TOLERANCE && Math.abs(pos.z - cz) <= MOVE_TO_TOLERANCE;
  if (!atApproach) {
    const r = ghost ? navigateBlind(ctx, st, out, ghost, best.cell) : navigateLive(ctx, st, out, best.cell, false, true);
    if (r !== 'arrived') return res(r, ghost);
  }
  const end1 = ended(st);
  if (end1) return res(end1, ghost);
  if (ghost || ctx.world.player(st).facing !== best.facing) {
    const [fx, fz] = facingDelta(best.facing);
    push(ctx, st, out, fx, fz);
    const end2 = ended(st);
    if (end2) return res(end2, ghost);
  }
  push(ctx, st, out, 0, 0, true);
  return res(st.status === 'complete' ? 'complete' : 'done', ghost);
}

/* ------------------------------------------------------------------------------------------------------------ */

export interface Vocabulary {
  /** Live tasks (filtered at run time: drop only while carrying, pick only empty-handed). */
  tasks: Task[];
  /** Blind variants offered to echo loops. */
  blindTasks: Task[];
  /** Waits offered before every echo task. */
  waits: Wait[];
  /** Waits offered before the final run's tasks and its exit (none + fixed: the live player adapts anyway). */
  finalWaits: Wait[];
  exit: Task;
}

export interface VocabularyOptions {
  /** Fixed waits in ticks. default [60, 180] */
  fixedWaits?: number[];
  /** Entities whose signal edges can be waited for. default: every door, gate, switch, receiver, deck, lift, socket. */
  signals?: string[];
  /** Offer signal waits in the final run too. default false */
  finalSignalWaits?: boolean;
  /** Extra stand cells (e.g. a corridor corner) beyond the automatic ones. */
  extraCells?: NavCell[];
  /** Drop targets beyond the automatic ones (plates, doorways, sockets). */
  extraDrops?: NavCell[];
  /** Restrict tasks to these tags (after generation); omit for all. */
  onlyTasks?: string[];
  /** Remove tasks with these tags. */
  withoutTasks?: string[];
  /** Offer the 'hold' task (a pure wait step). default true */
  hold?: boolean;
  /** Offer blind variants of these task tags to echoes ('all' = every go/press/pick/drop). default 'all' */
  blind?: 'all' | 'none' | string[];
}

/**
 * Signals worth waiting for by default: things a player watches (doors, gates, switches, receivers, decks, lifts,
 * sockets). Plates are left out: a plate wired to a door is visible as that door opening one tick later.
 */
const AUTO_SIGNAL_KINDS = new Set(['door', 'timedSwitch', 'laserReceiver', 'movingPlatform', 'elevator', 'temporalGate', 'energySocket']);

/** Builds the macro vocabulary for a level: the "documented bounds" of every search. */
export function buildVocabulary(level: LevelDefinition, opts: VocabularyOptions = {}): Vocabulary {
  const tasks: Task[] = [];
  const cellTag = (c: NavCell): string => `${c.col},${c.row}`;
  for (const e of level.entities) {
    const c = { col: e.col, row: e.row };
    switch (e.kind) {
      case 'pressurePlate':
        tasks.push({ kind: 'go', cell: c, tag: `stand ${e.id}` });
        break;
      case 'door':
      case 'temporalGate':
        tasks.push({ kind: 'go', cell: c, tag: `stand-in ${e.id}` });
        break;
      case 'elevator':
      case 'movingPlatform':
        tasks.push({ kind: 'go', cell: c, tag: `board ${e.id}` });
        break;
      case 'timedSwitch':
        tasks.push({ kind: 'press', entity: e.id, tag: `press ${e.id}` });
        break;
      case 'crate':
      case 'energyCell':
        tasks.push({ kind: 'pick', entity: e.id, tag: `pick ${e.id}` });
        break;
      default:
        break;
    }
  }
  const hasCrate = level.entities.some((e) => e.kind === 'crate');
  const hasCell = level.entities.some((e) => e.kind === 'energyCell');
  for (const e of level.entities) {
    const c = { col: e.col, row: e.row };
    if ((e.kind === 'pressurePlate' || e.kind === 'door') && hasCrate) tasks.push({ kind: 'drop', cell: c, tag: `drop-on ${e.id}` });
    if (e.kind === 'energySocket' && hasCell) tasks.push({ kind: 'drop', cell: c, tag: `insert ${e.id}` });
  }
  if (opts.hold !== false) tasks.push({ kind: 'hold', tag: 'hold' });
  for (const c of opts.extraCells ?? []) tasks.push({ kind: 'go', cell: c, tag: `go ${cellTag(c)}` });
  for (const c of opts.extraDrops ?? []) tasks.push({ kind: 'drop', cell: c, tag: `drop-at ${cellTag(c)}` });

  let filtered = tasks;
  if (opts.onlyTasks) filtered = filtered.filter((t) => opts.onlyTasks!.includes(t.tag));
  if (opts.withoutTasks) filtered = filtered.filter((t) => !opts.withoutTasks!.includes(t.tag));

  const blindSel = opts.blind ?? 'all';
  const blindTasks: Task[] =
    blindSel === 'none'
      ? []
      : filtered
          .filter((t) => t.kind !== 'hold' && (blindSel === 'all' || blindSel.includes(t.tag)))
          .map((t) => ({ ...t, blind: true, tag: `blind ${t.tag}` }) as Task);

  const signals = opts.signals ?? level.entities.filter((e) => AUTO_SIGNAL_KINDS.has(e.kind)).map((e) => e.id);
  const waits: Wait[] = [{ kind: 'none' }];
  for (const n of opts.fixedWaits ?? [60, 180]) waits.push({ kind: 'ticks', n });
  const fixedOnly = [...waits];
  for (const id of signals) {
    waits.push({ kind: 'signal', id, value: true });
    waits.push({ kind: 'signal', id, value: false });
  }
  const exitDef = level.entities.find((e) => e.id === level.exitId)!;
  return {
    tasks: filtered,
    blindTasks,
    waits,
    finalWaits: opts.finalSignalWaits ? waits : fixedOnly,
    exit: { kind: 'exit', cell: { col: exitDef.col, row: exitDef.row }, tag: 'exit' },
  };
}
