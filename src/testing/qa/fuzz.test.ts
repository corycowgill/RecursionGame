import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../../engine/contracts';
import { LEVELS, TEST_LEVELS, validateLevel } from '../../levels';
import { crateRoom, openRoom, terrainRoom } from '../harness/fixtures';
import { componentGauntlet } from './fixtures';
import { runFuzz } from './fuzz';
import { summarizeViolations, type Violation } from './invariants';

/**
 * Seeded fuzzing over every campaign level, the test chamber and the QA fixtures (including a chamber with all
 * 12 component kinds). Budget per (level, seed) defaults to 4000 ticks so `npm test` stays fast; scale it up with
 *   FUZZ_TICKS=50000 FUZZ_SEEDS=8 npx vitest run src/testing/qa/fuzz.test.ts     (or: npm run test:fuzz)
 * A failure message names the (level, seed) pair, which reproduces the run exactly.
 */

const TICKS = Number(process.env['FUZZ_TICKS'] ?? 4000);
const SEEDS = Number(process.env['FUZZ_SEEDS'] ?? 2);
const BASE_SEED = Number(process.env['FUZZ_SEED'] ?? 1);

/**
 * Known, reported engine/gameplay bugs that the fuzzer reproduces (details and repros: docs/agent-progress/qa.md
 * and src/testing/qa/known-bugs.test.ts). They are tallied, not failed, so they cannot mask other violations.
 * Delete an entry once its bug is fixed.
 */
export function knownIssue(v: Violation): string | null {
  if (v.rule === 'platform') return 'QA-1 rider left floating beside a moving deck';
  if (v.rule === 'solid' && v.entityKind === 'temporalGate') return 'QA-2 temporal gate closes on an occupant';
  if (v.rule === 'ledge' && v.entityKind === 'elevator') return 'QA-3 actor steps off a moving lift and clips its edge';
  return null;
}

const targets: LevelDefinition[] = [...LEVELS, ...TEST_LEVELS, openRoom(3), crateRoom(3), terrainRoom(), componentGauntlet(3)];

describe('fuzz: random inputs, rewinds, deletes, restarts, save/load and scrubs', () => {
  it('the QA component gauntlet is a structurally valid level', () => {
    const errors = validateLevel(componentGauntlet()).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  for (const level of targets) {
    for (let s = 0; s < SEEDS; s++) {
      const seed = BASE_SEED + s;
      it(`${level.id} seed ${seed}: ${TICKS} ticks without exceptions or invariant violations`, { timeout: 120_000 }, () => {
        const r = runFuzz(level, { seed, ticks: TICKS, known: knownIssue });
        expect(r.error, `exception (level ${level.id}, seed ${seed})`).toBeNull();
        expect(r.violations, `${level.id} seed ${seed}: ${summarizeViolations(r.violations)}`).toEqual([]);
        expect(r.ticks).toBe(TICKS);
        // The fuzzer must actually exercise the temporal API, not just walk around.
        expect(r.passes).toBeGreaterThan(1);
        expect((r.ops['scrub'] ?? 0) + (r.ops['preview'] ?? 0)).toBeGreaterThan(0);
      });
    }
  }

  it('is reproducible: the same seed yields the identical run (hash digest, ops and events)', () => {
    for (const level of [LEVELS[LEVELS.length - 1] as LevelDefinition, componentGauntlet()]) {
      const a = runFuzz(level, { seed: 42, ticks: 2500 });
      const b = runFuzz(level, { seed: 42, ticks: 2500 });
      expect(a.digest).toBe(b.digest);
      expect(a.ops).toEqual(b.ops);
      expect(a.events).toEqual(b.events);
      const c = runFuzz(level, { seed: 43, ticks: 2500 });
      expect(c.digest).not.toBe(a.digest);
    }
  });

  it('covers interactions: across seeds the fuzzer picks up, drops, presses plates and commits echoes', () => {
    const totals: Record<string, number> = {};
    let commits = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const r = runFuzz(componentGauntlet(), { seed, ticks: 3000, checkEvery: 4, replayCheck: false });
      commits += r.commits;
      for (const [k, v] of Object.entries(r.events)) totals[k] = (totals[k] ?? 0) + v;
    }
    expect(commits).toBeGreaterThan(0);
    for (const e of ['footstep', 'pickup', 'drop', 'plateDown', 'platformDepart', 'receiverLit']) expect(totals[e] ?? 0, `event ${e}`).toBeGreaterThan(0);
  });
});
