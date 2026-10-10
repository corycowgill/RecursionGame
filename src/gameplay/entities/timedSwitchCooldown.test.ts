import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../../engine/contracts';
import { createGame, playScript } from '../../testing/harness/harness';
import { S } from '../../testing/harness/script';
import { predictInteraction } from '../interactions/targeting';

/**
 * Timed switch cooldown (level-design addition used by L05 "Perfect Timing"): after a switch runs out it is locked
 * for config.cooldownTicks; presses fail with reason 'cooldown', so a window can never be extended by mashing E.
 */
function switchRoom(cooldownTicks: number | undefined): LevelDefinition {
  return {
    id: 'fixture-switch-cooldown',
    order: 0,
    name: 'switch cooldown',
    grid: { width: 7, height: 5, tiles: ['#######', '#.....#', '#.....#', '#.....#', '#######'] },
    entities: [
      {
        id: 'sw',
        kind: 'timedSwitch',
        col: 3,
        row: 1,
        config: cooldownTicks === undefined ? { durationTicks: 30, retrigger: false } : { durationTicks: 30, retrigger: false, cooldownTicks },
      },
      { id: 'exit', kind: 'exitPortal', col: 5, row: 3, config: {} },
    ],
    wires: [],
    playerSpawn: { col: 3, row: 2, facing: 0 },
    exitId: 'exit',
    maxEchoes: 1,
    loopDurationTicks: 600,
    parTimeSeconds: 10,
    hints: [],
    solution: [[S.wait(1)]],
  };
}

/** Press E every tick for `ticks` ticks; returns the per-tick output of the switch. */
function mash(cooldownTicks: number | undefined, ticks: number) {
  const game = createGame(switchRoom(cooldownTicks));
  const script = Array.from({ length: ticks }, () => S.interact());
  const pass = playScript(game, script);
  return { game, pass };
}

describe('timed switch cooldown', () => {
  it('without cooldown, mashing E re-lights the switch on the very next tick (legacy behaviour)', () => {
    const { pass } = mash(undefined, 100);
    const ons = pass.events.filter((e) => e.type === 'switchOn').map((e) => e.tick);
    expect(ons).toEqual([0, 30, 60, 90]);
    expect(pass.events.some((e) => e.type === 'interactFailed' && e.reason === 'cooldown')).toBe(false);
  });

  it('with cooldown, presses fail with "cooldown" until it expires, then the switch lights again', () => {
    const { pass } = mash(40, 150);
    const ons = pass.events.filter((e) => e.type === 'switchOn').map((e) => e.tick);
    const offs = pass.events.filter((e) => e.type === 'switchOff').map((e) => e.tick);
    expect(ons[0]).toBe(0);
    expect(offs[0]).toBe(29);
    // Locked for 40 ticks after switching off; the next successful press is right after.
    expect(ons[1]).toBe(offs[0]! + 41);
    const failed = pass.events.filter((e) => e.type === 'interactFailed');
    expect(failed.some((e) => e.type === 'interactFailed' && e.reason === 'cooldown')).toBe(true);
    expect(failed.some((e) => e.type === 'interactFailed' && e.reason === 'busy')).toBe(true);
  });

  it('the E-prompt predictor reports a running or cooling switch as blocked', () => {
    const { game } = mash(40, 10); // on, retrigger false
    const view = game.getState();
    const level = switchRoom(40);
    expect(predictInteraction(level, view).action).toBe('blocked');
    playScript(game, [S.wait(25)]); // ran out at tick 29 -> cooling down
    const v2 = game.getState();
    expect(v2.entities['sw']!.kind === 'timedSwitch' && (v2.entities['sw']!.state.cooldown ?? 0) > 0).toBe(true);
    expect(predictInteraction(level, v2).action).toBe('blocked');
  });
});
