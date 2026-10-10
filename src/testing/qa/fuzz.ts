import {
  IDLE_INPUT,
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type LevelDefinition,
  type PlayerInput,
  type SimEvent,
  type SimState,
  type SimView,
  type TemporalLoop,
} from '../../engine/contracts';
import { buildCollisionWorld } from '../../engine/physics/collision';
import { buildSurfaceOverrides, cellSurfaceAtPoint } from '../../engine/physics/terrain';
import { replayTracks } from '../../engine/simulation/recursion';
import { rngNext, seedRng } from '../../engine/simulation/rng';
import { decodeLoop, encodeLoop } from '../../engine/temporal/loops';
import type { TemporalGame } from '../../engine/temporal/TemporalGame';
import { createGame, firstHashMismatch, playInputs } from '../harness/harness';
import { InvariantChecker, type InvariantOptions, type Violation } from './invariants';

/**
 * RANDOMIZED FUZZ HARNESS — drives a TemporalGame through its PUBLIC API with seeded pseudo-random input and
 * meta operations (commit/rewind, reset loop, delete echo, restart chamber, save/load round-trips through the
 * loop codec, timeline reads, snapshot scrubs and temporal previews) for thousands of ticks, checking after every
 * tick:
 *   - no exceptions anywhere in the engine / behaviours
 *   - every InvariantChecker rule (integers only, actors never inside walls/solids, one carrier per object, ...)
 *   - scrubbing consistency: hashOf(getSnapshotAt(t)) equals the hash recorded live at tick t
 *   - rewind consistency: after restart / reset / setLoops the world equals a freshly loaded game with the same loops
 *   - replay equivalence: each finished pass re-simulated from (loops, recording) in a fresh game reproduces the
 *     exact per-tick hash sequence (no hidden state outside the loops)
 * The fuzzer's own randomness is a seeded mulberry32 stream: the same seed always produces the same run, so any
 * failure is reproducible from its (level, seed, ticks) triple.
 */

export interface FuzzOptions {
  seed: number;
  /** Total simulated ticks across all passes. */
  ticks: number;
  /** Invariant options (e.g. skipLedge). */
  invariants?: InvariantOptions;
  /** Check invariants every N ticks (1 = every tick). default 1 */
  checkEvery?: number;
  /** Re-simulate finished passes in a fresh game and compare hashes. default true */
  replayCheck?: boolean;
  /** Stop collecting after this many violations. default 50 */
  maxViolations?: number;
  /**
   * Classifier for known, already-reported bugs: returns an issue id to count the violation in `known` instead of
   * failing `violations`, or null.
   */
  known?: (v: Violation) => string | null;
}

export interface FuzzReport {
  levelId: string;
  seed: number;
  ticks: number;
  passes: number;
  commits: number;
  ops: Record<string, number>;
  events: Record<string, number>;
  violations: Violation[];
  /** Known-issue hits by rule (first example kept). */
  known: Record<string, { count: number; first: Violation }>;
  /** FNV-style digest over every per-tick hash in order: equal digests = identical runs. */
  digest: number;
  error: string | null;
}

class FuzzRng {
  private s: number;
  constructor(seed: number) {
    this.s = seedRng(seed);
  }
  next(): number {
    const r = rngNext(this.s);
    this.s = r.state;
    return r.value;
  }
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }
  chance(perMille: number): boolean {
    return this.int(1000) < perMille;
  }
  dir(): -1 | 0 | 1 {
    return (this.int(3) - 1) as -1 | 0 | 1;
  }
}

type Mode =
  | { kind: 'walk'; mx: -1 | 0 | 1; mz: -1 | 0 | 1; left: number }
  | { kind: 'seek'; col: number; row: number; fx: -1 | 0 | 1; fz: -1 | 0 | 1; left: number; path: { col: number; row: number }[] }
  | { kind: 'use'; fx: -1 | 0 | 1; fz: -1 | 0 | 1; step: number; left: number }
  | { kind: 'idle'; left: number };

const mix = (h: number, v: number): number => Math.imul((h ^ v) >>> 0, 16777619) >>> 0;

export function runFuzz(level: LevelDefinition, opts: FuzzOptions): FuzzReport {
  const rng = new FuzzRng(opts.seed ^ hashString(level.id));
  const checker = new InvariantChecker(level);
  const game = createGame(level, { snapshotInterval: 30 });
  const checkEvery = Math.max(1, opts.checkEvery ?? 1);
  const maxViolations = opts.maxViolations ?? 50;
  const report: FuzzReport = {
    levelId: level.id,
    seed: opts.seed,
    ticks: 0,
    passes: 1,
    commits: 0,
    ops: {},
    events: {},
    violations: [],
    known: {},
    digest: 2166136261,
    error: null,
  };
  const op = (name: string): void => void (report.ops[name] = (report.ops[name] ?? 0) + 1);
  const violate = (rule: Violation['rule'], message: string, entityKind?: string): void => {
    const v: Violation = entityKind === undefined ? { rule, tick: game.getState().tick, message } : { rule, tick: game.getState().tick, message, entityKind };
    const id = opts.known?.(v) ?? null;
    if (id !== null) {
      const k = report.known[id];
      if (k) k.count++;
      else report.known[id] = { count: 1, first: v };
      return;
    }
    if (report.violations.length < maxViolations) report.violations.push(v);
  };
  const targets = level.entities.map((e) => ({ col: e.col, row: e.row }));
  targets.push({ col: level.playerSpawn.col, row: level.playerSpawn.row });
  /** Where a carried item is most interesting: sockets and plates. */
  const receivers = level.entities.filter((e) => e.kind === 'energySocket' || e.kind === 'pressurePlate').map((e) => ({ col: e.col, row: e.row }));

  /** Hashes of the current pass: passHashes[t] = hash of the state at tick t (index 0 = initial). */
  let passHashes: number[] = [game.hash()];
  let mode: Mode = { kind: 'idle', left: 1 };
  const freshHash = (loops: readonly TemporalLoop[]): number => {
    const g = createGame(level);
    if (loops.length) g.setLoops(loops);
    return g.hash();
  };
  const newPass = (why: string): void => {
    report.passes++;
    passHashes = [game.hash()];
    if (game.getState().tick !== 0) violate('data', `${why}: new pass starts at tick ${game.getState().tick}`);
    // The rewound world must equal a freshly loaded chamber with the same loops (no state leaks across passes).
    if (rng.chance(250)) {
      const expect = freshHash(game.getLoops());
      if (expect !== passHashes[0]) violate('data', `${why}: rewound world hash ${passHashes[0]} != fresh ${expect}`);
    }
  };
  const replayCheck = (): void => {
    if (opts.replayCheck === false) return;
    const rec = game.getRecording();
    if (rec.length === 0) return;
    const replay = createGame(level);
    if (game.getLoops().length) replay.setLoops(game.getLoops());
    const pass = playInputs(replay, rec);
    const live = passHashes.slice(1);
    const at = firstHashMismatch(live, pass.hashes);
    if (at !== -1) violate('data', `replay of pass diverges from live hashes at tick ${at} (loops=${game.getLoops().length})`);
  };

  const nextInput = (tick: number): PlayerInput => {
    const st = game.getState();
    const p = st.actors[st.actors.length - 1];
    if (mode.left <= 0) {
      const r = rng.int(20);
      if (r < 4) mode = { kind: 'walk', mx: rng.dir(), mz: rng.dir(), left: 5 + rng.int(60) };
      else if (r < 18) {
        // Seek an entity: stand on it (plates, lifts, decks) or next to it facing it, then use it.
        const pool = p && p.carrying !== null && rng.chance(600) ? receivers : targets;
        const t = pool[rng.int(pool.length)] ?? targets[0] ?? { col: 1, row: 1 };
        const side = rng.int(5);
        const fx = (side === 1 ? -1 : side === 2 ? 1 : 0) as -1 | 0 | 1;
        const fz = (side === 3 ? -1 : side === 4 ? 1 : 0) as -1 | 0 | 1;
        const col = t.col - fx;
        const row = t.row - fz;
        const path = p ? findPath(checker, game.getState(), fdiv(p.x, UNITS_PER_TILE), fdiv(p.z, UNITS_PER_TILE), col, row) : [];
        mode = { kind: 'seek', col, row, fx, fz, left: 80 + path.length * 40 + rng.int(160), path };
      } else mode = { kind: 'idle', left: 1 + rng.int(90) };
    }
    mode.left--;
    let mx: -1 | 0 | 1 = 0;
    let mz: -1 | 0 | 1 = 0;
    let interact = rng.chance(15);
    if (mode.kind === 'walk') {
      mx = mode.mx;
      mz = mode.mz;
    } else if (mode.kind === 'seek' && p) {
      // Follow the BFS path cell by cell, then home in on the destination cell centre.
      while (mode.path.length > 0) {
        const n = mode.path[0] as { col: number; row: number };
        if (Math.abs(n.col * UNITS_PER_TILE + 500 - p.x) <= 120 && Math.abs(n.row * UNITS_PER_TILE + 500 - p.z) <= 120) mode.path.shift();
        else break;
      }
      const wp = mode.path[0] ?? { col: mode.col, row: mode.row };
      const tx = wp.col * UNITS_PER_TILE + 500;
      const tz = wp.row * UNITS_PER_TILE + 500;
      mx = Math.abs(tx - p.x) > 60 ? (tx > p.x ? 1 : -1) : 0;
      mz = Math.abs(tz - p.z) > 60 ? (tz > p.z ? 1 : -1) : 0;
      if (rng.chance(30)) mx = rng.dir(); // a little jitter so paths are not perfectly repeatable
      if (rng.chance(30)) mz = rng.dir();
      if (mx === 0 && mz === 0 && fdiv(p.x, UNITS_PER_TILE) === mode.col && fdiv(p.z, UNITS_PER_TILE) === mode.row)
        mode = { kind: 'use', fx: mode.fx, fz: mode.fz, step: 0, left: 2 + rng.int(120) };
    } else if (mode.kind === 'use') {
      // tick 0: tap toward the entity (sets facing), tick 1: press E (or Space), then stand still a while.
      if (mode.step === 0) {
        mx = mode.fx;
        mz = mode.fz;
      } else if (mode.step === 1) interact = rng.chance(850);
      mode.step++;
    }
    const action = mode.kind === 'use' && mode.step === 2 ? rng.chance(150) : rng.chance(8);
    return {
      tick,
      moveX: mx,
      moveY: mz,
      interactPressed: interact,
      interactHeld: interact || rng.chance(30),
      actionPressed: action,
    };
  };

  const meta = (): void => {
    const loops = game.getLoops();
    const st = game.getState();
    const roll = rng.int(10000);
    if (roll < 10) {
      op('commit');
      replayCheck();
      const before = loops.length;
      const ok = game.commitLoopAndRewind();
      if (ok) {
        report.commits++;
        if (game.getLoops().length !== before + 1) violate('actors', 'commit did not add a loop');
        newPass('commit');
      } else if (before < level.maxEchoes && game.getRecording().length > 0) violate('actors', 'commit refused below the echo limit');
      else if (st.tick > 0 && before >= level.maxEchoes) {
        op('commit@limit');
        game.resetLoop(); // what the app does at the echo limit
        newPass('reset@limit');
      }
    } else if (roll < 12) {
      op('resetLoop');
      game.resetLoop();
      newPass('resetLoop');
    } else if (roll < 15 && loops.length > 0) {
      op('deleteLoop');
      game.deleteLoop(rng.int(loops.length));
      newPass('deleteLoop');
    } else if (roll < 16) {
      op('restartChamber');
      game.restartChamber();
      if (game.getLoops().length !== 0) violate('actors', 'restart kept loops');
      newPass('restart');
    } else if (roll < 20 && loops.length > 0) {
      // Save/load round-trip: persist loops with the codec (through JSON) and install them again.
      op('saveLoad');
      const json = JSON.stringify(loops.map(encodeLoop));
      const decoded = (JSON.parse(json) as ReturnType<typeof encodeLoop>[]).map(decodeLoop);
      game.setLoops(decoded);
      newPass('setLoops');
    } else if (roll < 50 && st.tick > 0) {
      op('scrub');
      const t = rng.int(st.tick + 1);
      const snap = game.getSnapshotAt(t);
      if (snap.tick !== t) violate('data', `getSnapshotAt(${t}) returned tick ${snap.tick}`);
      const h = game.hashOf(snap);
      if (h !== passHashes[t]) violate('data', `snapshot hash at tick ${t} = ${h}, live was ${passHashes[t]}`);
      if (game.hash() !== passHashes[st.tick]) violate('data', 'scrubbing changed the live state');
    } else if (roll < 60 && st.status === 'playing') {
      op('preview');
      const t = st.tick + 1 + rng.int(240);
      const snap = game.getSnapshotAt(t);
      const v = checker.check(snap, loops, { ...opts.invariants });
      for (const x of v) violate(x.rule, `[preview t=${snap.tick}] ${x.message}`, x.entityKind);
      if (game.hash() !== passHashes[st.tick]) violate('data', 'temporal preview changed the live state');
    } else if (roll < 83) {
      op('timeline');
      const tl = game.getTimeline();
      const expectTracks = replayTracks(level, loops).length + 1; // nested-loop copies get tracks of their own
      if (tl.tracks.length !== expectTracks) violate('actors', `timeline has ${tl.tracks.length} tracks for ${loops.length} loops`);
      if (tl.currentTick !== st.tick) violate('data', 'timeline tick mismatch');
    }
  };

  try {
    while (report.ticks < opts.ticks && report.violations.length < maxViolations) {
      meta();
      const st = game.getState();
      if (st.status !== 'playing') {
        // timeUp / complete: the take becomes an echo when allowed, otherwise the loop restarts (app behaviour).
        op(st.status === 'complete' ? 'completed' : 'timeUp');
        replayCheck();
        if (game.getLoops().length < level.maxEchoes && rng.chance(600) && game.commitLoopAndRewind()) {
          report.commits++;
          newPass('auto-commit');
        } else {
          game.resetLoop();
          newPass('auto-reset');
        }
        continue;
      }
      const tick = st.tick;
      const input = nextInput(tick);
      const r = game.step(input);
      if (!r.advanced) {
        violate('data', `step did not advance while playing at tick ${tick}`);
        break;
      }
      countEvents(report.events, r.events);
      report.ticks++;
      const h = game.hash();
      passHashes.push(h);
      report.digest = mix(report.digest, h);
      if (game.getState().tick !== tick + 1) violate('data', `tick went ${tick} -> ${game.getState().tick}`);
      if (report.ticks % checkEvery === 0) for (const v of checker.check(game.getState(), game.getLoops(), opts.invariants)) violate(v.rule, v.message, v.entityKind);
    }
    // Drain the meta-event queue too: it must never throw or grow without bound.
    game.drainEvents();
  } catch (err) {
    report.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  }
  return report;
}

/**
 * BFS over the walkable grid (static tiles + current entity surfaces such as lifts and decks). Two neighbouring
 * cells connect when their surfaces meet within STEP_TOLERANCE at the shared edge. Returns the cells after the
 * start (empty when unreachable or already there). Entities that block (doors, crates) are ignored: the fuzzer
 * simply bumps into them, which is a useful case too.
 */
export function findPath(checker: InvariantChecker, view: SimView, c0: number, r0: number, c1: number, r1: number): { col: number; row: number }[] {
  const rt = checker.rt;
  const state = view as unknown as SimState;
  const ov = buildSurfaceOverrides(rt, state);
  const W = rt.width;
  const H = rt.height;
  // Cells currently blocked for the player by solid entities (closed doors, consoles, resting crates...).
  const blocked = new Set<number>();
  const player = state.actors[state.actors.length - 1];
  for (const b of buildCollisionWorld(rt, state).solids) {
    if (player && b.blocks && !b.blocks(player)) continue;
    blocked.add(fdiv(b.minZ + b.maxZ, 2 * UNITS_PER_TILE) * W + fdiv(b.minX + b.maxX, 2 * UNITS_PER_TILE));
  }
  if (c1 < 0 || r1 < 0 || c1 >= W || r1 >= H || (c0 === c1 && r0 === r1)) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = r0 * W + c0;
  prev[start] = start;
  const queue = [start];
  const goal = r1 * W + c1;
  const T = UNITS_PER_TILE;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi] as number;
    if (cur === goal) break;
    const col = cur % W;
    const row = (cur - col) / W;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
      const ni = nr * W + nc;
      if (prev[ni] !== -1 || (blocked.has(ni) && ni !== goal)) continue;
      // Shared edge midpoint.
      const ex = dc === 1 ? (col + 1) * T : dc === -1 ? col * T : col * T + 500;
      const ez = dr === 1 ? (row + 1) * T : dr === -1 ? row * T : row * T + 500;
      const a = cellSurfaceAtPoint(rt, ov, col, row, ex, ez);
      const b = cellSurfaceAtPoint(rt, ov, nc, nr, ex, ez);
      if (a === null || b === null || Math.abs(a - b) > PHYS.STEP_TOLERANCE) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return [];
  const out: { col: number; row: number }[] = [];
  for (let c = goal; c !== start; c = prev[c] as number) out.push({ col: c % W, row: Math.floor(c / W) });
  return out.reverse();
}

function countEvents(into: Record<string, number>, events: readonly SimEvent[]): void {
  for (const e of events) into[e.type] = (into[e.type] ?? 0) + 1;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Idle input helper for scripted checks. */
export const idleAt = (tick: number): PlayerInput => ({ ...IDLE_INPUT, tick });

export type { TemporalGame };
