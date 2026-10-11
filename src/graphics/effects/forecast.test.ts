import { describe, expect, it } from 'vitest';
import type { LevelDefinition, SimView } from '../../engine/contracts';
import {
  ForecastSampler,
  GHOST_MARKER_TICKS,
  extractGhostPaths,
  forecastDeviation,
  scheduleWalkOns,
  walkOnTriggers,
  type ForecastActor,
  type ForecastSample,
  type WalkOnTrigger,
} from './forecast';

const actor = (id: string, echoIndex: number, x: number, z: number, extra: Partial<ForecastActor> = {}): ForecastActor => ({ id, echoIndex, x, y: 0, z, finished: false, ...extra });
const sample = (tick: number, actors: ForecastActor[], triggerY: Record<string, number> = {}): ForecastSample => ({ tick, actors, triggerY });

/** Echo 1 walks east 40 units/tick from x=500 for 120 ticks, then stands; echo 2 never moves. */
function walkSamples(step = 6, until = 240): ForecastSample[] {
  const out: ForecastSample[] = [];
  for (let t = 100; t <= until; t += step) {
    const moved = Math.min(t - 100, 120) * 40;
    out.push(sample(t, [actor('echo:1', 0, 500 + moved, 1500, { finished: t - 100 >= 120 }), actor('echo:2', 1, 3500, 3500)]));
  }
  return out;
}

describe('extractGhostPaths (Q-preview trails)', () => {
  it('builds one path per moving echo with 1 s tick markers relative to the preview start', () => {
    const paths = extractGhostPaths(walkSamples(), 100);
    expect(paths).toHaveLength(1); // echo 2 stands still: no trail
    const p = paths[0]!;
    expect(p.actorId).toBe('echo:1');
    expect(p.echoIndex).toBe(0);
    expect(p.points[0]).toMatchObject({ tick: 100, x: 500, z: 1500 });
    expect(p.points[p.points.length - 1]).toMatchObject({ x: 500 + 120 * 40 });
    // stationary tail collapsed: last point is where it stopped (tick 220), not the end of the samples
    expect(p.points[p.points.length - 1]!.tick).toBe(220);
    expect(p.markers.map((m) => m.seconds)).toEqual([1, 2]);
    expect(p.markers[0]!.tick).toBe(100 + GHOST_MARKER_TICKS);
  });

  it('starts at fromTick, skips hidden echoes and their nested copies', () => {
    const s = walkSamples().map((x) => ({ ...x, actors: [...x.actors, { ...x.actors[0]!, id: 'echo:1.1', recursion: 1, z: 2500 }] }));
    const later = extractGhostPaths(s, 160);
    expect(later.every((p) => p.points[0]!.tick >= 160)).toBe(true);
    expect(later.map((p) => p.actorId)).toEqual(['echo:1', 'echo:1.1']);
    expect(later[1]!.recursion).toBe(1);
    expect(extractGhostPaths(s, 100, new Set(['echo:1']))).toHaveLength(0);
  });
});

describe('scheduleWalkOns (plate badges)', () => {
  const plate: WalkOnTrigger = { id: 'p1', kind: 'pressurePlate', col: 3, row: 1 };

  it('finds when each echo steps on and off a trigger (centre-in-cell rule)', () => {
    const w = scheduleWalkOns(walkSamples(), [plate]);
    expect(w).toHaveLength(1);
    // x reaches 3000 (col 3) at tick 100 + 2500/40 = 162.5 -> first sample on it is 166; leaves at x>=4000 (tick 187.5 -> 190)
    expect(w[0]).toMatchObject({ entityId: 'p1', actorId: 'echo:1', echoIndex: 0, enterTick: 166, leaveTick: 190 });
  });

  it('keeps an open interval for an echo that stays, and respects trigger height', () => {
    const s = [sample(0, [actor('echo:1', 0, 3500, 1500)], { p1: 0 }), sample(6, [actor('echo:1', 0, 3500, 1500)], { p1: 0 })];
    expect(scheduleWalkOns(s, [plate])[0]).toMatchObject({ enterTick: 0, leaveTick: null });
    const high = s.map((x) => ({ ...x, triggerY: { p1: 2000 } }));
    expect(scheduleWalkOns(high, [plate])).toHaveLength(0);
  });

  it('lists only plates and ride-mode lifts as walk-on triggers', () => {
    const level = {
      entities: [
        { id: 'a', kind: 'pressurePlate', col: 1, row: 2, config: {} },
        { id: 'b', kind: 'elevator', col: 3, row: 4, config: { levels: [0, 1], mode: 'ride' } },
        { id: 'c', kind: 'elevator', col: 5, row: 6, config: { levels: [0, 1] } },
        { id: 'd', kind: 'timedSwitch', col: 7, row: 8, config: {} },
      ],
    } as unknown as LevelDefinition;
    expect(walkOnTriggers(level).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('forecastDeviation / ForecastSampler', () => {
  const view = (tick: number, x: number): SimView => ({ tick, actors: [{ id: 'echo:1', kind: 'echo', x, y: 0, z: 1500 }] }) as unknown as SimView;

  it('is ~0 on the forecast course and grows when an echo is pushed off it', () => {
    const s = walkSamples();
    expect(forecastDeviation(s, view(130, 500 + 30 * 40))).toBe(0);
    expect(forecastDeviation(s, view(130, 500))).toBeGreaterThan(1000);
    expect(forecastDeviation(s, view(50, 0))).toBe(0); // not covered
  });

  it('samples incrementally and stops once every echo has finished', () => {
    const snap = (t: number): SimView =>
      ({ tick: t, actors: [{ id: 'echo:1', kind: 'echo', echoIndex: 0, x: t * 10, y: 0, z: 0, finished: t >= 60 }], entities: {} }) as unknown as SimView;
    let clock = 0;
    const sampler = new ForecastSampler('k', 0, 600, []);
    sampler.pump(snap, 1, () => (clock += 1)); // budget 1 ms with a 1 ms clock: exactly one sample per pump
    expect(sampler.samples).toHaveLength(1);
    while (!sampler.done) sampler.pump(snap, 100, () => 0);
    expect(sampler.coveredTick).toBe(60);
    expect(sampler.samples.map((x) => x.tick).slice(0, 3)).toEqual([0, 6, 12]);
  });
});
