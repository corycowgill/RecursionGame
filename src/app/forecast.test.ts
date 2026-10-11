import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type LevelDefinition, type SimEvent } from '../engine/contracts';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { FORECAST_STEP, sampleOf, walkOnTriggers } from '../graphics/effects/forecast';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import { EchoForecastController, InlineForecastBackend, type ForecastBackend } from './forecast';
import { ForecastEngine } from './forecastEngine';
import { solutionFor } from './solutions';

const L1 = CAMPAIGN_LEVELS[0] as LevelDefinition; // Echo 1 walks to the balcony plate and stays on it

function midSolve(level: LevelDefinition, ticks: number): TemporalGame {
  const g = new TemporalGame(createDefaultRegistry());
  g.loadLevel(level);
  const sol = solutionFor(level);
  g.setLoops(sol.echoes);
  for (let i = 0; i < ticks; i++) g.step(sol.final[i] ?? { ...IDLE_INPUT, tick: i });
  g.drainEvents();
  return g;
}

const request = (g: TemporalGame, id = 1) => ({ id, level: g.level, loops: g.getLoops(), recording: g.getRecording().slice(), fromTick: g.getState().tick });

describe('ForecastEngine (private replay of the live pass)', () => {
  it('reproduces the live game exactly and samples the same future as getSnapshotAt', () => {
    const live = midSolve(L1, 90);
    const engine = new ForecastEngine();
    engine.start(request(live));
    const samples = engine.runToEnd();
    expect(samples[0]!.tick).toBe(90);
    const triggers = walkOnTriggers(L1);
    for (const s of samples.slice(0, 40)) expect(s).toEqual(sampleOf(live.getSnapshotAt(s.tick), triggers));
    expect(samples[1]!.tick - samples[0]!.tick).toBe(FORECAST_STEP);
    // stops once the echoes have finished (well before the loop end)
    const last = samples[samples.length - 1]!;
    expect(last.actors.every((a) => a.finished)).toBe(true);
    expect(last.tick).toBeLessThan(L1.loopDurationTicks);
  });

  it('continues an earlier replay when the recording prefix matches, reloads when it does not', () => {
    const live = midSolve(L1, 60);
    const engine = new ForecastEngine();
    engine.start(request(live));
    engine.runToEnd();
    for (let i = 0; i < 30; i++) live.step({ ...IDLE_INPUT, tick: live.getState().tick, moveX: 1 });
    engine.start(request(live, 2));
    const s = engine.runToEnd();
    expect(s[0]).toEqual(sampleOf(live.getSnapshotAt(90), walkOnTriggers(L1)));
  });
});

describe('EchoForecastController', () => {
  const frame = (g: TemporalGame, events: SimEvent[] = []) => ({ level: g.level, live: g.getState(), loops: g.getLoops(), recording: g.getRecording(), events });

  it('forecasts a new pass, plans the echo stepping on the plate, and extracts its ghost path', () => {
    const g = midSolve(L1, 1);
    const c = new EchoForecastController(new InlineForecastBackend(() => 0));
    // inline backend with a frozen clock: the whole forecast fits in the first update's budget
    c.update(frame(g));
    expect(c.forecastSamples.length).toBeGreaterThan(10);
    const walk = c.walkOns();
    expect(walk.length).toBeGreaterThanOrEqual(1);
    expect(walk[0]).toMatchObject({ entityId: 'plate-a', echoIndex: 0, leaveTick: null });
    expect(walk[0]!.enterTick).toBeGreaterThan(1);
    const paths = c.ghostPaths(1, new Set());
    expect(paths).toHaveLength(1);
    expect(paths[0]!.markers.length).toBeGreaterThan(1);
    expect(c.ghostPaths(1, new Set())).toBe(paths); // cached identity (renderer rebuilds only on change)
    expect(c.ghostPaths(1, new Set([paths[0]!.actorId]))).toHaveLength(0);
    c.dispose();
  });

  it('re-forecasts on a new pass, on divergence / player interaction, and not otherwise', () => {
    const reqs: number[] = [];
    const backend: ForecastBackend = { request: (r) => void reqs.push(r.fromTick), poll: () => [], dispose: () => undefined };
    const g = midSolve(L1, 10);
    const c = new EchoForecastController(backend);
    c.update(frame(g));
    expect(reqs).toEqual([10]);
    for (let i = 0; i < 40; i++) g.step({ ...IDLE_INPUT, tick: g.getState().tick });
    c.update(frame(g));
    expect(reqs).toHaveLength(1); // nothing happened
    c.update(frame(g, [{ type: 'pickup', tick: 50, actorId: 'player', entityId: 'x', entityKind: 'crate' } as SimEvent]));
    expect(reqs).toEqual([10, 50]);
    c.update(frame(g, [{ type: 'pickup', tick: 50, actorId: 'echo:1', entityId: 'x', entityKind: 'crate' } as SimEvent]));
    expect(reqs).toHaveLength(2); // echo actions are already in the forecast
    g.resetLoop(); // rewind: new pass
    c.update(frame(g));
    expect(reqs).toEqual([10, 50, 0]);
    c.refresh(frame(g));
    expect(reqs).toHaveLength(4);
  });
});
