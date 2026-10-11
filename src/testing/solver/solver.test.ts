import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../levels';
import { analysisFor } from './levelConfigs';
import { NavGraph } from './navigation';
import { search } from './search';
import { verifySolution } from './verify';

/**
 * FAST CI SUBSET of the puzzle solver (levels 1-4). The full analysis (every level, deeper bounds, cheese hunts) is
 * `npm run solve -- <level>`; results are written up in docs/game-design/difficulty-report.md.
 *
 * Each "proof" here is exhaustive within the level's small `ci` bounds (see levelConfigs.ts): if a layout edit opens
 * a cheaper route inside those bounds, this test fails with the route the solver found.
 */

const CI_LEVELS = LEVELS.slice(0, 4);

describe('solver: static navigation', () => {
  for (const level of LEVELS) {
    it(`${level.id}: the exit is reachable from the spawn on the optimistic map`, () => {
      const g = new NavGraph(level);
      const exit = level.entities.find((e) => e.id === level.exitId)!;
      const path = g.path(level.playerSpawn, { col: exit.col, row: exit.row });
      expect(path).not.toBeNull();
      expect(g.waypoints(path!).length).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('solver: CI subset (levels 1-4)', () => {
  it('rediscovers First Echo with one echo and verifies it through TemporalGame', () => {
    const level = LEVELS[0]!;
    const r = search(level, { echoes: 1, ...analysisFor(level).find }, { maxSolutions: 1, budgetMs: 60_000 });
    expect(r.solutions.length).toBe(1);
    expect(verifySolution(level, r.solutions[0]!).ok).toBe(true);
  });

  it('rediscovers Two Places at Once with two echoes', { timeout: 120_000 }, () => {
    const level = LEVELS[1]!;
    const r = search(level, { echoes: 2, ...analysisFor(level).find }, { maxSolutions: 1, budgetMs: 100_000 });
    expect(r.solutions.length).toBe(1);
    expect(verifySolution(level, r.solutions[0]!).ok).toBe(true);
  });

  for (const level of CI_LEVELS) {
    const cfg = analysisFor(level);
    const ci = cfg.ci!;
    for (let k = 0; k < cfg.intended; k++) {
      if (k > 0 && ci.echoSteps === 0) continue;
      it(`${level.id}: no solution with ${k} echo(es) within the CI bounds (exhaustive)`, { timeout: 120_000 }, () => {
        const r = search(level, { ...ci, echoes: k }, { maxSolutions: 1, budgetMs: 110_000 });
        const found = r.solutions[0];
        expect(found ? [...found.echoes.map((e) => e.steps.join(' > ')), found.final.steps.join(' > ')] : null).toBeNull();
        expect(r.exhaustive).toBe(true);
      });
    }
  }
});
