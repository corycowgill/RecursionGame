import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../engine/contracts';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { LEVELS } from '../levels';
import { attractSuspended, comfortOf, qualityOverrideOf, rendererQuality, sampleRewind, solutionFor, withoutHiddenEchoes } from './flow';

describe('app flow helpers', () => {
  it('maps settings quality presets onto renderer presets', () => {
    expect(rendererQuality('low')).toBe('low');
    expect(rendererQuality('medium')).toBe('medium');
    expect(rendererQuality('high')).toBe('high');
    expect(rendererQuality('ultra')).toBe('high');
    expect(rendererQuality(null)).toBe('high');
  });

  it('validates ?quality= overrides against the settings presets', () => {
    expect(qualityOverrideOf('low')).toBe('low');
    expect(qualityOverrideOf('ultra')).toBe('ultra');
    expect(qualityOverrideOf('potato')).toBeNull();
    expect(qualityOverrideOf(null)).toBeNull();
    expect(qualityOverrideOf('')).toBeNull();
  });

  it('suspends the attract replay only while a main-menu sub-screen covers it', () => {
    expect(attractSuspended('menu', 'menu')).toBe(false);
    expect(attractSuspended('menu', 'settings')).toBe(true);
    expect(attractSuspended('menu', 'levels')).toBe(true);
    expect(attractSuspended('menu', 'credits')).toBe(true);
    expect(attractSuspended('playing', 'settings')).toBe(false); // in-game the pause flow already stops the sim
    expect(attractSuspended('menu', null)).toBe(false);
  });

  it('passes the comfort settings to the renderer', () => {
    expect(comfortOf({ cameraSensitivity: 1.5, reducedMotion: true })).toEqual({ cameraSensitivity: 1.5, reducedMotion: true });
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

  it('hiding a nested-loop echo also hides its recursive copies (L08)', () => {
    const l08 = LEVELS.find((l) => l.recursion)!;
    const game = new TemporalGame(createDefaultRegistry());
    game.loadLevel(l08);
    game.setLoops(solutionFor(l08).echoes);
    const view = game.getState();
    const echoes = view.actors.filter((a) => a.kind === 'echo');
    expect(echoes.length).toBeGreaterThanOrEqual(2);
    const base = echoes.find((a) => !a.id.includes('.'))!;
    const shown = withoutHiddenEchoes(view, new Set([base.id]));
    expect(shown.actors.filter((a) => a.kind === 'echo')).toHaveLength(0);
  });
});
