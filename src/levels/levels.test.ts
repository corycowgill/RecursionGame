import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, TEST_LEVELS } from './definitions';
import { validateLevel } from './validators/validateLevel';
import { runScripts, verifyLevelSolution } from '../testing/harness/harness';
import { testChamber } from './definitions/test-chamber';

describe('levels', () => {
  for (const level of [...TEST_LEVELS, ...CAMPAIGN_LEVELS]) {
    it(`${level.id}: validates and its known solution completes`, () => {
      expect(validateLevel(level).filter((i) => i.severity === 'error')).toEqual([]);
      const v = verifyLevelSolution(level);
      expect(v.reason).toBeUndefined();
      expect(v.ok).toBe(true);
      expect(v.echoesUsed).toBeLessThanOrEqual(level.maxEchoes);
    });
  }

  it('test chamber cannot be solved without an echo', () => {
    const final = testChamber.solution[testChamber.solution.length - 1]!;
    const solo = runScripts(testChamber, [final]);
    expect(solo.completed).toBe(false);
    // and trying the plate-then-door route alone also fails (door closes behind)
    const route = runScripts(testChamber, [
      [
        { op: 'moveTo', col: 8, row: 3 },
        { op: 'moveTo', col: 5, row: 3 },
        { op: 'moveTo', col: 5, row: 5, timeoutTicks: 300 },
      ],
    ]);
    expect(route.completed).toBe(false);
  });

  it('levels are JSON round-trippable and remain solvable after round-trip', () => {
    const copy = JSON.parse(JSON.stringify(testChamber));
    expect(verifyLevelSolution(copy).ok).toBe(true);
  });
});
