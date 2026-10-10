import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../engine/contracts';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { LEVELS } from '../levels';
import { rendererQuality, sampleRewind, solutionFor, withoutHiddenEchoes } from './flow';

describe('app flow helpers', () => {
  it('maps settings quality presets onto renderer presets', () => {
    expect(rendererQuality('low')).toBe('low');
    expect(rendererQuality('medium')).toBe('medium');
    expect(rendererQuality('high')).toBe('high');
    expect(rendererQuality('ultra')).toBe('high');
    expect(rendererQuality(null)).toBe('high');
  });

  it('solutionFor drives every campaign level to completion through the public game API (attract mode / debug solve)', () => {
    for (const level of LEVELS) {
      const game = new TemporalGame(createDefaultRegistry());
      game.loadLevel(level);
      const sol = solutionFor(level);
      game.setLoops(sol.echoes);
      for (let i = 0; i <= level.loopDurationTicks && game.getState().status === 'playing'; i++) {
        const t = game.getState().tick;
        game.step(sol.final[t] ?? { ...IDLE_INPUT, tick: t });
      }
      expect(game.getState().status, level.id).toBe('complete');
      expect(solutionFor(level)).toBe(sol); // cached
    }
  });

  it('rewind playback samples exact snapshots from the present back to tick 0 without touching the live state', () => {
    const level = LEVELS[0]!;
    const game = new TemporalGame(createDefaultRegistry());
    game.loadLevel(level);
    const sol = solutionFor(level);
    for (let t = 0; t < 120; t++) game.step(sol.echoes[0]?.inputs[t] ?? { ...IDLE_INPUT, tick: t });
    const before = game.hash();
    const frames = sampleRewind((t) => game.getSnapshotAt(t), game.getState().tick, 12);
    expect(frames.length).toBe(13);
    expect(frames[0]!.tick).toBe(120);
    expect(frames[frames.length - 1]!.tick).toBe(0);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.tick).toBeLessThan(frames[i - 1]!.tick);
    expect(game.hash()).toBe(before);
    expect(game.getState().tick).toBe(120);
    expect(sampleRewind((t) => game.getSnapshotAt(t), 0, 12)).toEqual([]);
  });

  it('echo visibility filter only hides echoes from the rendered copy', () => {
    const level = LEVELS[0]!;
    const game = new TemporalGame(createDefaultRegistry());
    game.loadLevel(level);
    game.setLoops(solutionFor(level).echoes);
    const view = game.getState();
    const echoId = view.actors.find((a) => a.kind === 'echo')!.id;
    const shown = withoutHiddenEchoes(view, new Set([echoId]));
    expect(shown.actors.some((a) => a.id === echoId)).toBe(false);
    expect(shown.actors.some((a) => a.kind === 'player')).toBe(true);
    expect(view.actors.some((a) => a.id === echoId)).toBe(true);
    expect(withoutHiddenEchoes(view, new Set())).toBe(view);
  });
});
