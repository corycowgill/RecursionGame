import { describe, expect, it } from 'vitest';
import type { EntityDefinition, LevelDefinition, PressurePlateConfig, TimedSwitchConfig } from '../../engine/contracts';
import { createGame, playInputs, playScript, replayLoops } from '../../testing/harness/harness';
import { S } from '../../testing/harness/script';
import { validateLevel } from '../../levels/validators/validateLevel';
import { pressurePlateBehaviour } from './pressurePlate';
import { timedSwitchBehaviour } from './timedSwitch';
import { ent, entityOf, mini, named } from './testkit';

/**
 * ATTUNED DEVICES (gold = player only, cyan = echoes only) and PARADOX GLASS (shatterOn), round 6.
 *   ##########
 *   #S.P...W.#   S spawn (1,1)  P plate (3,1)  W timed switch (7,1)
 *   #...C....#   C crate (4,2)
 *   #........#
 *   ##########
 */
function room(plate: PressurePlateConfig = {}, sw: TimedSwitchConfig = { durationTicks: 120 }, o: { recursion?: { delayTicks: number }; maxEchoes?: number } = {}): LevelDefinition {
  const entities: EntityDefinition[] = [
    ent({ id: 'plate', kind: 'pressurePlate', col: 3, row: 1, config: plate }),
    ent({ id: 'switch', kind: 'timedSwitch', col: 7, row: 1, config: sw }),
    ent({ id: 'crate', kind: 'crate', col: 4, row: 2, config: {} }),
  ];
  return mini('attuned-room', {
    tiles: ['##########', '#........#', '#........#', '#........#', '##########'],
    entities,
    spawn: { col: 1, row: 1, facing: 1 },
    exit: { col: 8, row: 3 },
    ...(o.recursion ? { recursion: o.recursion } : {}),
    ...(o.maxEchoes !== undefined ? { maxEchoes: o.maxEchoes } : {}),
  });
}

const plateOf = (g: ReturnType<typeof createGame>) => entityOf(g.getState(), 'plate', 'pressurePlate').state;
const switchOf = (g: ReturnType<typeof createGame>) => entityOf(g.getState(), 'switch', 'timedSwitch').state;
const PRESS = [S.moveTo(6, 1), S.face(1), S.interact()];

describe('attuned pressure plates', () => {
  it("unconfigured / accepts:'all' keep the original state shape (no broken field)", () => {
    const def = ent({ id: 'p', kind: 'pressurePlate', col: 0, row: 0, config: {} });
    expect(pressurePlateBehaviour.reset(def, { runtime: null as never })).toEqual({ pressed: false, occupants: 0, pressedTicks: 0 });
    const glass = ent({ id: 'p', kind: 'pressurePlate', col: 0, row: 0, config: { shatterOn: 'echoes' } });
    expect(pressurePlateBehaviour.reset(glass, { runtime: null as never })).toEqual({ pressed: false, occupants: 0, pressedTicks: 0, broken: false });
  });

  it('gold seal (player only): the player presses it, an echo standing on it is ignored', () => {
    const g = createGame(room({ accepts: 'player' }));
    playScript(g, [S.moveTo(3, 1), S.wait(3)]);
    expect(plateOf(g).pressed).toBe(true);
    expect(g.commitLoopAndRewind()).toBe(true);
    playInputs(g, [], 120); // the echo walks onto the plate and stays; the player idles at spawn
    expect(plateOf(g).pressed).toBe(false);
    expect(plateOf(g).occupants).toBe(0);
  });

  it('echo plate: the live player is ignored, an echo presses it', () => {
    const g = createGame(room({ accepts: 'echoes' }));
    playScript(g, [S.moveTo(3, 1), S.wait(3)]);
    expect(plateOf(g).pressed).toBe(false);
    expect(g.commitLoopAndRewind()).toBe(true);
    playInputs(g, [], 120);
    expect(plateOf(g).pressed).toBe(true);
    expect(plateOf(g).occupants).toBe(1);
  });

  it('nested-loop copies count as echoes (threshold counts matching bodies only)', () => {
    const level = room({ accepts: 'echoes', threshold: 2 }, { durationTicks: 120 }, { recursion: { delayTicks: 60 } });
    const g = createGame(level);
    playScript(g, [S.moveTo(3, 1), S.wait(3)]);
    expect(g.commitLoopAndRewind()).toBe(true);
    playInputs(g, [], 60);
    expect(plateOf(g).pressed).toBe(false); // only the echo so far
    const p2 = playScript(g, [S.moveTo(3, 1), S.wait(100)]); // the player joins: still ignored; the copy arrives later
    expect(p2.events.some((e) => e.type === 'plateDown')).toBe(true);
    expect(plateOf(g).occupants).toBe(2); // echo + copy, the player is not counted
  });

  it('crates never count on an attuned plate (acceptsCrates is ignored)', () => {
    const g = createGame(room({ accepts: 'echoes', acceptsCrates: true }));
    playScript(g, [S.moveTo(4, 3), S.face(0), S.interact(), S.moveTo(4, 1), S.face(3), S.interact(), S.moveTo(6, 2), S.wait(3)]);
    expect(g.getState().entities['crate']!.x).toBe(3500);
    expect(plateOf(g).pressed).toBe(false);
    // ...while on an ordinary plate the same crate presses it
    const g2 = createGame(room({}));
    playScript(g2, [S.moveTo(4, 3), S.face(0), S.interact(), S.moveTo(4, 1), S.face(3), S.interact(), S.moveTo(6, 2), S.wait(3)]);
    expect(plateOf(g2).pressed).toBe(true);
  });
});

describe('attuned consoles', () => {
  it('Echo Console: a live press fails (attuned), the same input replayed by the echo succeeds -> intended divergence', () => {
    const level = room({}, { durationTicks: 120, accepts: 'echoes' });
    const g = createGame(level);
    const live = playScript(g, PRESS);
    expect(live.events.some((e) => e.type === 'interactFailed' && e.reason === 'attuned')).toBe(true);
    expect(switchOf(g).on).toBe(false);
    expect(g.commitLoopAndRewind()).toBe(true);
    const outcome = g.getLoops()[0]!.outcomes.find((o) => o.entityId === 'switch')!;
    expect(outcome).toMatchObject({ kind: 'fail', reason: 'attuned' });
    const replay = playInputs(g, [], 200);
    const div = replay.events.filter((e) => e.type === 'divergence');
    expect(div.length).toBe(1);
    const d = div[0]!;
    if (d.type !== 'divergence') throw new Error('unreachable');
    expect(d.expected).toMatchObject({ kind: 'fail', reason: 'attuned', entityId: 'switch' });
    expect(d.actual).toMatchObject({ kind: 'use', entityId: 'switch' });
    expect(replay.events.some((e) => e.type === 'switchOn' && e.actorId === 'echo:1')).toBe(true);
    // the timeline records the divergence with the recorded reason
    const track = g.getTimeline().tracks.find((t) => t.actorId === 'echo:1')!;
    expect(track.divergences[0]!.expected.reason).toBe('attuned');
  });

  it('Gold Console: a recording that pressed it live fails on replay (use -> fail attuned)', () => {
    const g = createGame(room({}, { durationTicks: 120, accepts: 'player' }));
    const live = playScript(g, PRESS);
    expect(live.events.some((e) => e.type === 'switchOn')).toBe(true);
    expect(g.commitLoopAndRewind()).toBe(true);
    const replay = playInputs(g, [], 200);
    const d = replay.events.find((e) => e.type === 'divergence');
    expect(d && d.type === 'divergence' ? [d.expected.kind, d.actual.kind, d.actual.reason] : null).toEqual(['use', 'fail', 'attuned']);
    expect(switchOf(g).on).toBe(false);
  });

  it('an attuned refusal changes nothing (no cooldown, no timer, no activatedBy)', () => {
    const g = createGame(room({}, { durationTicks: 120, accepts: 'echoes', cooldownTicks: 60 }));
    const before = JSON.stringify(switchOf(g));
    playScript(g, PRESS);
    expect(JSON.stringify(switchOf(g))).toBe(before);
  });

  it("unconfigured switches keep the original state shape", () => {
    const def = ent({ id: 's', kind: 'timedSwitch', col: 0, row: 0, config: { durationTicks: 60 } });
    expect(timedSwitchBehaviour.reset(def, { runtime: null as never })).toEqual({ on: false, remainingTicks: 0, activatedBy: null });
  });
});

describe('paradox glass', () => {
  it('glass plate: shatters the first time a forbidden body stands on it, names that actor, stays dark all pass', () => {
    const g = createGame(room({ shatterOn: 'player', latch: true }));
    const p = playScript(g, [S.moveTo(3, 1), S.wait(5), S.moveTo(6, 1), S.moveTo(3, 1), S.wait(5)]);
    const sh = named(p.events, 'shatter');
    expect(sh.length).toBe(1); // one-shot
    expect(sh[0]!.actorId).toBe('player');
    expect(plateOf(g)).toEqual({ pressed: false, occupants: 0, pressedTicks: 0, broken: true });
    expect(g.getState().signals['plate']).toBe(false);
  });

  it('a latched glass plate pressed by an echo goes dark when the player later steps on it', () => {
    const g = createGame(room({ shatterOn: 'player', latch: true }));
    playScript(g, [S.moveTo(3, 1), S.moveTo(3, 3)]); // recording: shatters the plate live (fine, it is a recording)
    expect(g.commitLoopAndRewind()).toBe(true);
    const a = playInputs(g, [], 80); // the echo latches it
    expect(plateOf(g).pressed).toBe(true);
    expect(named(a.events, 'shatter')).toEqual([]);
    const b = playScript(g, [S.moveTo(3, 1), S.wait(2)]);
    expect(named(b.events, 'shatter')[0]!.actorId).toBe('player');
    expect(b.events.some((e) => e.type === 'plateUp')).toBe(true);
    expect(plateOf(g).pressed).toBe(false);
    expect(g.getState().signals['plate']).toBe(false);
  });

  it('names the FIRST shattering actor in actor-array order (echoes before the player)', () => {
    const g = createGame(room({ shatterOn: 'echoes' }));
    playScript(g, [S.moveTo(3, 1), S.wait(400)]);
    expect(g.commitLoopAndRewind()).toBe(true);
    playScript(g, [S.moveTo(3, 1), S.wait(400)]);
    expect(g.commitLoopAndRewind()).toBe(true);
    const p = playInputs(g, [], 120); // both echoes arrive on the same tick
    const sh = named(p.events, 'shatter');
    expect(sh.length).toBe(1);
    expect(sh[0]!.actorId).toBe('echo:1');
  });

  it('broken resets on the next pass (rewind, delete, restart)', () => {
    const g = createGame(room({ shatterOn: 'player' }));
    playScript(g, [S.moveTo(3, 1)]);
    expect(plateOf(g).broken).toBe(true);
    g.resetLoop();
    expect(plateOf(g).broken).toBe(false);
    playScript(g, [S.moveTo(3, 1)]);
    g.restartChamber();
    expect(plateOf(g).broken).toBe(false);
  });

  it("glass console: a forbidden press fails 'shattered' and breaks it; later presses (anyone) fail 'shattered'", () => {
    const g = createGame(room({}, { durationTicks: 120, shatterOn: 'player', accepts: 'echoes' }));
    const a = playScript(g, PRESS);
    expect(a.events.some((e) => e.type === 'interactFailed' && e.reason === 'shattered')).toBe(true);
    expect(named(a.events, 'shatter')[0]!.actorId).toBe('player');
    expect(switchOf(g)).toMatchObject({ on: false, remainingTicks: 0, broken: true });
    const b = playScript(g, [S.interact(), S.wait(2)]);
    expect(b.events.some((e) => e.type === 'interactFailed' && e.reason === 'shattered')).toBe(true);
    expect(named(b.events, 'shatter')).toEqual([]);
    g.resetLoop();
    expect(switchOf(g).broken).toBe(false);
  });

  it('a switch that is ON when it shatters turns off at once and stays dark', () => {
    // the echo turns it on (its live recording shattered it, so this is an intended fail->use divergence), then the
    // player (forbidden class) presses it while it runs
    const level = room({}, { durationTicks: 600, shatterOn: 'player', accepts: 'echoes' });
    const h = createGame(level);
    playScript(h, [S.moveTo(6, 1), S.face(1), S.interact(), S.moveTo(6, 3)]); // live: shatters... the recording
    expect(h.commitLoopAndRewind()).toBe(true);
    const p = playScript(h, [S.moveTo(5, 3), S.wait(60)]);
    expect(p.events.some((e) => e.type === 'switchOn' && e.actorId === 'echo:1')).toBe(true);
    expect(switchOf(h).on).toBe(true);
    const q = playScript(h, [S.moveTo(6, 1), S.face(1), S.interact(), S.wait(3)]);
    expect(named(q.events, 'shatter')[0]!.actorId).toBe('player');
    expect(q.events.some((e) => e.type === 'switchOff')).toBe(true);
    expect(h.getState().signals['switch']).toBe(false);
  });

  it('deterministic: replays reproduce identical per-tick hashes', () => {
    const level = room({ accepts: 'echoes', shatterOn: 'player' }, { durationTicks: 120, accepts: 'echoes' });
    const g = createGame(level);
    const rec = playScript(g, [...PRESS, S.moveTo(3, 1), S.wait(10)]);
    expect(g.commitLoopAndRewind()).toBe(true);
    const a = replayLoops(level, g.getLoops(), rec.inputs);
    const b = replayLoops(level, g.getLoops(), rec.inputs);
    expect(a.hashes).toEqual(b.hashes);
  });
});

describe('attuned / glass validator rules', () => {
  const issues = (level: LevelDefinition) => validateLevel(level).map((i) => `${i.severity}: ${i.message}`);
  it('flags impossible configurations', () => {
    expect(issues(room({ accepts: 'player', threshold: 2 })).some((m) => m.startsWith('error') && m.includes('threshold'))).toBe(true);
    expect(issues(room({ accepts: 'echoes' }, undefined, { maxEchoes: 0 })).some((m) => m.startsWith('error') && m.includes('no echoes'))).toBe(true);
    expect(issues(room({ accepts: 'echoes', shatterOn: 'echoes' })).some((m) => m.startsWith('error') && m.includes('shatterOn'))).toBe(true);
    expect(issues(room({ accepts: 'echoes', acceptsCrates: true })).some((m) => m.startsWith('warning') && m.includes('acceptsCrates'))).toBe(true);
    const bad = room();
    (bad.entities[2]!.config as Record<string, unknown>)['accepts'] = 'player';
    expect(issues(bad).some((m) => m.startsWith('error') && m.includes("'accepts' is only valid"))).toBe(true);
    expect(issues(room({ accepts: 'echoes', shatterOn: 'player' }, { durationTicks: 60, accepts: 'player', shatterOn: 'echoes' })).filter((m) => m.startsWith('error'))).toEqual([]);
  });
});
