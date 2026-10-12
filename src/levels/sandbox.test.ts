import { describe, expect, it } from 'vitest';
import { runScripts, runSolution, verifyLevelSolution } from '../testing/harness/harness';
import { SANDBOX_LEVELS } from './definitions/sandbox-levels';
import { validateLevel } from './validators/validateLevel';
import { CAMPAIGN_LEVELS } from './definitions';

/** Round-6 mechanic sandboxes: valid, solvable with their authored solution, not solvable alone, not in the campaign. */
describe.each(SANDBOX_LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level) => {
  it('validates with no errors or warnings', () => {
    expect(validateLevel(level)).toEqual([]);
  });
  it('the known solution completes and replays deterministically', () => {
    const v = verifyLevelSolution(level);
    expect(v.reason).toBeUndefined();
    expect(v.ok).toBe(true);
    const a = runSolution(level);
    const b = runSolution(level);
    expect(a.passes.map((p) => p.finalHash)).toEqual(b.passes.map((p) => p.finalHash));
  });
  it('is not part of the campaign', () => {
    expect(CAMPAIGN_LEVELS.some((l) => l.id === level.id)).toBe(false);
    expect(level.order).toBe(0);
  });
  if ((level.parEchoes ?? 0) > 0)
    it('cannot be solved by the final run alone', () => {
      expect(runScripts(level, [level.solution[level.solution.length - 1]!]).completed).toBe(false);
    });
});

describe('sandbox lessons', () => {
  it('Echo Line: standing too briefly is not enough (the window is as long as the press)', () => {
    const relay = SANDBOX_LEVELS[0]!;
    const brief = runScripts(relay, [[{ op: 'moveTo', col: 4, row: 1 }, { op: 'moveTo', col: 5, row: 2 }, { op: 'moveTo', col: 5, row: 4, timeoutTicks: 600 }]]);
    expect(brief.completed).toBe(true); // brushing the plate gives a ~1 s window, still enough when already waiting
    const late = runScripts(relay, [[{ op: 'moveTo', col: 4, row: 1 }, { op: 'wait', ticks: 30 }, { op: 'moveTo', col: 1, row: 2 }, { op: 'wait', ticks: 420 }, { op: 'moveTo', col: 5, row: 4, timeoutTicks: 120 }]]);
    expect(late.completed).toBe(false); // arriving after the delayed pulse has passed
  });
  it('Sump Valve: alone, the player latches the plate but is locked in the sump', () => {
    const valve = SANDBOX_LEVELS[1]!;
    const alone = runScripts(valve, [[{ op: 'moveTo', col: 9, row: 2 }, { op: 'moveTo', col: 3, row: 3, timeoutTicks: 400 }, { op: 'moveTo', col: 3, row: 5, timeoutTicks: 200 }]]);
    expect(alone.completed).toBe(false);
  });
  it('Attuned Keys: an echo that walks the straight line shatters the seal and the door never opens', () => {
    const lvl = SANDBOX_LEVELS[2]!;
    const straight = runScripts(lvl, [
      [{ op: 'moveTo', col: 8, row: 2 }, { op: 'face', dir: 1 }, { op: 'interact' }, { op: 'wait', ticks: 10 }],
      lvl.solution[1]!,
    ]);
    expect(straight.completed).toBe(false);
    const ok = runSolution(lvl);
    const final = ok.passes[ok.passes.length - 1]!;
    const divs = final.events.filter((e) => e.type === 'divergence');
    expect(divs.length).toBe(1);
    expect(divs[0]!.type === 'divergence' && divs[0]!.expected.reason).toBe('attuned');
    expect(final.events.some((e) => e.type === 'entity' && e.name === 'shatter')).toBe(false);
  });
});
