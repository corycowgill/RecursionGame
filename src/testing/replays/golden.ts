import type { LevelDefinition } from '../../engine/contracts';
import { decodeLoop, encodeLoop, type EncodedLoop } from '../../engine/temporal/loops';
import { replayLoops, runSolution } from '../harness/harness';
import { hashString, runFuzz } from '../qa/fuzz';

/**
 * GOLDEN REPLAYS — a frozen record of what each level's known solution does, tick by tick:
 *   - the compiled loops themselves (run-length encoded, exactly what the save system stores),
 *   - per pass: tick count, final world hash, a digest over EVERY per-tick hash, checkpoints every 60 ticks,
 *     the completion tick and per-pass event counts.
 * The replay test re-runs the solution scripts AND re-simulates the stored loops without scripts; both must
 * reproduce the golden bit for bit. A mismatch means simulation behaviour changed (engine, physics, a behaviour,
 * tick order, hashing). If the change is intended, re-bless with `npm run replays:update` and commit the diff.
 *
 * `levelFingerprint` hashes the level definition, so editing a level is reported as "level changed: re-bless"
 * rather than as a determinism regression.
 */

export const GOLDEN_SCHEMA = 1;
export const CHECKPOINT_EVERY = 60;

export interface GoldenPass {
  ticks: number;
  finalHash: number;
  /** FNV-1a-style digest over every per-tick hash of the pass, in order. */
  digest: number;
  /** tick (1-based count of simulated ticks) -> world hash, every CHECKPOINT_EVERY ticks and at the end. */
  checkpoints: Record<string, number>;
  completedAtTick: number | null;
  events: Record<string, number>;
}

export interface GoldenReplay {
  schema: number;
  levelId: string;
  levelFingerprint: number;
  maxEchoes: number;
  loopDurationTicks: number;
  completedAtTick: number | null;
  /** Encoded loops: the committed echoes followed by the final player run. */
  loops: EncodedLoop[];
  passes: GoldenPass[];
}

export interface FuzzFingerprint {
  levelId: string;
  levelFingerprint: number;
  seed: number;
  ticks: number;
  digest: number;
  passes: number;
  commits: number;
}

export interface FuzzGolden {
  schema: number;
  /** Bump when the fuzzer's decision logic changes (its digests then change by design). */
  fuzzerVersion: number;
  runs: FuzzFingerprint[];
}

/** Bump together with any behavioural change to src/testing/qa/fuzz.ts. */
export const FUZZER_VERSION = 1;

export function digestHashes(hashes: readonly number[]): number {
  let h = 2166136261;
  for (const x of hashes) h = Math.imul((h ^ x) >>> 0, 16777619) >>> 0;
  return h;
}

export function levelFingerprint(level: LevelDefinition): number {
  return hashString(JSON.stringify(level));
}

function passRecord(hashes: readonly number[], completedAtTick: number | null, events: readonly { type: string }[]): GoldenPass {
  const checkpoints: Record<string, number> = {};
  hashes.forEach((h, i) => {
    const t = i + 1;
    if (t % CHECKPOINT_EVERY === 0 || t === hashes.length) checkpoints[String(t)] = h;
  });
  const ev: Record<string, number> = {};
  for (const e of events) ev[e.type] = (ev[e.type] ?? 0) + 1;
  return {
    ticks: hashes.length,
    finalHash: hashes[hashes.length - 1] ?? 0,
    digest: digestHashes(hashes),
    checkpoints,
    completedAtTick,
    events: sortKeys(ev),
  };
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k] as T;
  return out;
}

/** Runs the level's known solution and records its golden replay. */
export function computeGolden(level: LevelDefinition): GoldenReplay {
  const res = runSolution(level);
  return {
    schema: GOLDEN_SCHEMA,
    levelId: level.id,
    levelFingerprint: levelFingerprint(level),
    maxEchoes: level.maxEchoes,
    loopDurationTicks: level.loopDurationTicks,
    completedAtTick: res.completedAtTick,
    loops: res.loops.map((l, i) => encodeLoop({ ...l, id: i === res.loops.length - 1 ? 0 : l.id })),
    passes: res.passes.map((p) => passRecord(p.hashes, p.completedAtTick, p.events)),
  };
}

/** Pure re-simulation of a golden's stored loops (no scripts): returns the final pass record. */
export function replayGolden(level: LevelDefinition, golden: GoldenReplay): GoldenPass {
  const loops = golden.loops.map(decodeLoop);
  const final = loops.pop();
  const r = replayLoops(level, loops, final?.inputs ?? []);
  return passRecord(r.hashes, r.completedAtTick, r.events);
}

/** Describes the first difference between two pass records (null when identical). */
export function diffPass(expected: GoldenPass, actual: GoldenPass): string | null {
  if (expected.digest === actual.digest && expected.ticks === actual.ticks && expected.finalHash === actual.finalHash) {
    if (JSON.stringify(expected.events) !== JSON.stringify(actual.events))
      return `same world hashes but different events: expected ${JSON.stringify(expected.events)}, got ${JSON.stringify(actual.events)}`;
    return null;
  }
  for (const [t, h] of Object.entries(expected.checkpoints)) {
    const a = actual.checkpoints[t];
    if (a !== h) return `first differing checkpoint at tick ${t}: expected ${h}, got ${a ?? 'none'} (ticks ${expected.ticks} -> ${actual.ticks}, completedAt ${expected.completedAtTick} -> ${actual.completedAtTick})`;
  }
  return `per-tick digest differs (ticks ${expected.ticks} -> ${actual.ticks}, final hash ${expected.finalHash} -> ${actual.finalHash}, completedAt ${expected.completedAtTick} -> ${actual.completedAtTick})`;
}

/** Fixed-seed fuzz runs used as behaviour fingerprints for components the campaign does not (yet) use. */
export function computeFuzzFingerprint(level: LevelDefinition, seed: number, ticks: number): FuzzFingerprint {
  const r = runFuzz(level, { seed, ticks, checkEvery: 1_000_000, replayCheck: false });
  if (r.error) throw new Error(`fuzz fingerprint ${level.id}/${seed} threw: ${r.error}`);
  return { levelId: level.id, levelFingerprint: levelFingerprint(level), seed, ticks, digest: r.digest, passes: r.passes, commits: r.commits };
}
