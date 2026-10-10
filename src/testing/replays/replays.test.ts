import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../../engine/contracts';
import { LEVELS, TEST_LEVELS } from '../../levels';
import { componentGauntlet } from '../qa/fixtures';
import {
  FUZZER_VERSION,
  GOLDEN_SCHEMA,
  computeFuzzFingerprint,
  computeGolden,
  diffPass,
  levelFingerprint,
  replayGolden,
  type FuzzGolden,
  type GoldenReplay,
} from './golden';

/**
 * DETERMINISTIC REPLAY SUITE (golden files in this directory, one per level: <levelId>.golden.json).
 *   npm run replays:update      re-bless every golden (after an INTENDED simulation change or a level edit)
 * Every check below must reproduce the stored golden bit for bit.
 */

const DIR = dirname(fileURLToPath(import.meta.url));
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';
const levels: LevelDefinition[] = [...LEVELS, ...TEST_LEVELS];
const fileOf = (id: string): string => join(DIR, `${id}.golden.json`);
const FUZZ_FILE = join(DIR, 'fuzz-fingerprints.golden.json');
const FUZZ_RUNS: [LevelDefinition, number, number][] = [
  [componentGauntlet(), 7, 3000],
  [componentGauntlet(), 8, 3000],
  ...LEVELS.map((l): [LevelDefinition, number, number] => [l, 7, 2000]),
];

const write = (file: string, data: unknown): void => writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const REBLESS = 'run `npm run replays:update` and review/commit the golden diff';

describe('golden replays', () => {
  for (const level of levels) {
    describe(level.id, () => {
      const file = fileOf(level.id);

      it('known solution reproduces the golden per-tick hashes, events and completion tick', () => {
        const actual = computeGolden(level);
        if (UPDATE) {
          write(file, actual);
          return;
        }
        expect(existsSync(file), `missing golden ${file}: ${REBLESS}`).toBe(true);
        const golden = read<GoldenReplay>(file);
        expect(golden.schema).toBe(GOLDEN_SCHEMA);
        expect(golden.levelFingerprint, `level '${level.id}' definition changed since the golden was blessed: ${REBLESS}`).toBe(levelFingerprint(level));
        expect(actual.passes.length, 'number of passes').toBe(golden.passes.length);
        golden.passes.forEach((g, i) => expect(diffPass(g, actual.passes[i]!), `pass ${i}: simulation behaviour changed. If intended, ${REBLESS}`).toBeNull());
        expect(actual.completedAtTick).toBe(golden.completedAtTick);
        expect(actual.loops, 'compiled loops (scripts produced different inputs)').toEqual(golden.loops);
      });

      it('stored loops re-simulate (no scripts, via the save codec) to the golden final pass', () => {
        if (UPDATE || !existsSync(file)) return;
        const golden = read<GoldenReplay>(file);
        if (golden.levelFingerprint !== levelFingerprint(level)) return; // reported by the test above
        const replay = replayGolden(level, golden);
        expect(diffPass(golden.passes[golden.passes.length - 1]!, replay)).toBeNull();
        expect(replay.completedAtTick).toBe(golden.completedAtTick);
      });
    });
  }

  it('fixed-seed fuzz fingerprints (covers every component kind) are unchanged', { timeout: 120_000 }, () => {
    const runs = FUZZ_RUNS.map(([l, seed, ticks]) => computeFuzzFingerprint(l, seed, ticks));
    if (UPDATE) {
      write(FUZZ_FILE, { schema: GOLDEN_SCHEMA, fuzzerVersion: FUZZER_VERSION, runs } satisfies FuzzGolden);
      return;
    }
    expect(existsSync(FUZZ_FILE), `missing ${FUZZ_FILE}: ${REBLESS}`).toBe(true);
    const golden = read<FuzzGolden>(FUZZ_FILE);
    expect(golden.fuzzerVersion, `fuzzer version changed: ${REBLESS}`).toBe(FUZZER_VERSION);
    for (const r of runs) {
      const g = golden.runs.find((x) => x.levelId === r.levelId && x.seed === r.seed && x.ticks === r.ticks);
      expect(g, `no fuzz fingerprint for ${r.levelId}/${r.seed}: ${REBLESS}`).toBeDefined();
      if (g!.levelFingerprint !== r.levelFingerprint) {
        expect.soft(g!.levelFingerprint, `level '${r.levelId}' changed: ${REBLESS}`).toBe(r.levelFingerprint);
        continue;
      }
      expect(r, `fuzz fingerprint ${r.levelId}/${r.seed}: behaviour changed. If intended, ${REBLESS}`).toEqual(g);
    }
  });

  it('no orphaned golden files (every golden belongs to a current level)', () => {
    const ids = new Set(levels.map((l) => l.id));
    const orphans = readdirSync(DIR)
      .filter((f) => f.endsWith('.golden.json') && f !== 'fuzz-fingerprints.golden.json')
      .filter((f) => !ids.has(f.replace(/\.golden\.json$/, '')));
    if (UPDATE) {
      for (const f of orphans) unlinkSync(join(DIR, f));
      return;
    }
    expect(orphans, REBLESS).toEqual([]);
  });
});
