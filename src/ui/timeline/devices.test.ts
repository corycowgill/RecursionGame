import { describe, expect, it } from 'vitest';
import type { SimEvent, Timeline } from '../../engine/contracts';
import { createGame, playScript } from '../../testing/harness/harness';
import { S } from '../../testing/harness/script';
import { sandboxAttuned, sandboxRelay } from '../../levels/definitions/sandbox-levels';
import { runSolution } from '../../testing/harness/harness';
import { collectShatters, isIntendedDivergence, relayRow, relayRows } from './devices';
import { buildTrackModels } from './model';

describe('timeline round 6: chrono relay rows', () => {
  it('reconstructs the input waveform from the relay state and shifts the ghost by delay + 1', () => {
    // a 60-tick relay; the input rose at tick 100 and fell at tick 130; now = 139 (tick = 140)
    const d = 60;
    const s = { out: false, last: false, pending: [100 + d - 139, 130 + d - 139] };
    const row = relayRow('r', 'Echo Line - 1 s', d, 140, s);
    expect(row.input).toEqual([{ from: 100, to: 130 }]);
    expect(row.ghost).toEqual([{ from: 161, to: 191 }]);
    expect(row.arrivals.map((a) => [a.tick, a.rising])).toEqual([
      [161, true],
      [191, false],
    ]);
    expect(row.arrivals[0]!.label).toBe('arrives 0:02.7');
  });

  it('matches the simulation: the first arrival is when the consumer actually reacts', () => {
    const game = createGame(sandboxRelay);
    const pass = playScript(game, [S.moveTo(4, 1), S.wait(30)]);
    const rows = relayRows(sandboxRelay, game.getState());
    expect(rows.length).toBe(1);
    expect(rows[0]!.label).toBe('Echo Line - 6 s');
    const down = pass.events.find((e) => e.type === 'plateDown')!.tick;
    expect(rows[0]!.arrivals[0]!.tick).toBe(down + 2 + 360); // consumer reacts delay + 2 ticks after the source
    expect(rows[0]!.input[0]!.from).toBe(down + 1);
    const rest = playScript(game, [S.wait(400)]);
    expect(rest.events.find((e) => e.type === 'doorOpen')!.tick).toBe(down + 2 + 360);
  });
});

describe('timeline round 6: intended divergences and shatter markers', () => {
  it("attuned divergences are 'intended' (violet) and do not hatch the lane as a paradox", () => {
    const res = runSolution(sandboxAttuned);
    const tl: Timeline = res.game.getTimeline();
    const echo = buildTrackModels(tl).find((t) => t.key === 'echo:1')!;
    expect(echo.divergences.length).toBe(1);
    expect(echo.divergences[0]!.intended).toBe(true);
    expect(echo.divergedAt).toBeNull();
    // The recorded refusal is drawn as the echo's press (not a coral failure / paradox marker), before and after.
    const mk = echo.markers.find((m) => m.entityKind === 'timedSwitch')!;
    expect(mk.state).toBe('done');
    expect(mk.kind).toBe('use');
    expect(mk.title).toMatch(/answers echoes/);
    expect(isIntendedDivergence({ expected: { reason: 'attuned' } })).toBe(true);
    expect(isIntendedDivergence({ expected: { reason: 'cooldown' } })).toBe(false);
  });

  it('collects shatter markers per pass and clears them on rewind', () => {
    const ev = (e: Partial<SimEvent> & { type: SimEvent['type'] }) => e as SimEvent;
    let m = collectShatters([], [ev({ type: 'entity', tick: 40, name: 'shatter', entityId: 'g', actorId: 'echo:1' })], () => 'Glass Plate');
    expect(m).toEqual([{ tick: 40, actorId: 'echo:1', entityId: 'g', title: 'Glass Plate shattered at 0:00.7' }]);
    const same = collectShatters(m, [ev({ type: 'footstep', tick: 41 })]);
    expect(same).toBe(m);
    m = collectShatters(m, [ev({ type: 'rewind', tick: 0, fromTick: 50, loopCount: 1 })]);
    expect(m).toEqual([]);
  });
});
