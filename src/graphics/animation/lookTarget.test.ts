import { describe, expect, it } from 'vitest';
import type { ActorView, EntityDefinition, SimView, Timeline, TimelineTrack } from '../../engine/contracts';
import { IDLE_NEAR_TILES, LOOK_LOOKAHEAD_TICKS, selectLookTarget, targetedInteractable } from './lookTarget';

const c = (cell: number) => cell * 1000 + 500;

function actor(id: string, o: Partial<ActorView> = {}): ActorView {
  return {
    id,
    kind: id === 'player' ? 'player' : 'echo',
    echoIndex: id === 'player' ? -1 : 0,
    loopId: null,
    x: c(2),
    y: 0,
    z: c(2),
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 1, // east
    heading: 2,
    moving: false,
    carrying: null,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
    ...o,
  } as unknown as ActorView;
}

const ent = (id: string, kind: string, col: number, row: number, state: object, y = 0, carriedBy: string | null = null) => ({ id, kind, x: c(col), y, z: c(row), carriedBy, state });

function view(actors: ActorView[], entities: ReturnType<typeof ent>[], tick = 100): SimView {
  return {
    tick,
    status: 'playing',
    completedAtTick: null,
    rng: 1,
    actors,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    signals: {},
  } as unknown as SimView;
}

function track(actorId: string, planned: [number, string][]): TimelineTrack {
  return {
    actorId: actorId as TimelineTrack['actorId'],
    kind: 'echo',
    echoIndex: 0,
    loopId: 1,
    durationTicks: 600,
    planned: planned.map(([tick, entityId]) => ({ tick, kind: 'use', verb: 'interact', entityId, entityKind: 'timedSwitch', success: true })),
    actual: [],
    divergences: [],
    finishedAtTick: null,
  };
}
const tl = (tracks: TimelineTrack[]): Timeline => ({ levelId: 'L', currentTick: 0, maxTicks: 600, maxEchoes: 3, status: 'playing', tracks });

describe('look target: the interactable actually targeted', () => {
  it('looks at the timed switch in the faced cell (head height), not just the faced cell', () => {
    const p = actor('player');
    const v = view([p], [ent('sw', 'timedSwitch', 3, 2, { on: false })]);
    const t = selectLookTarget(v, p, null);
    expect(t).toMatchObject({ entityId: 'sw', reason: 'targeted' });
    expect(t!.x).toBeCloseTo(7, 5); // cell 3 centre = 3.5 tiles = 7 m
    expect(t!.z).toBeCloseTo(5, 5);
    expect(t!.y).toBeGreaterThan(1);
  });

  it('follows the sim candidate order: probe cell first, then own cell, id order, one height level', () => {
    const p = actor('player');
    // own cell has a crate, probe cell has a cell: probe wins
    expect(targetedInteractable(view([p], [ent('a-crate', 'crate', 2, 2, {}), ent('b-cell', 'energyCell', 3, 2, { socketId: null })]), p)?.id).toBe('b-cell');
    // nothing in the probe cell: own cell
    expect(targetedInteractable(view([p], [ent('a-crate', 'crate', 2, 2, {})]), p)?.id).toBe('a-crate');
    // two in the probe cell: id order
    expect(targetedInteractable(view([p], [ent('z-crate', 'crate', 3, 2, {}), ent('m-crate', 'crate', 3, 2, {})]), p)?.id).toBe('m-crate');
    // a level above: out of reach
    expect(targetedInteractable(view([p], [ent('hi', 'crate', 3, 2, {}, 1000)]), p)).toBeNull();
    // facing north: the east crate is not targeted
    const north = actor('player', { facing: 0 });
    expect(targetedInteractable(view([north], [ent('e', 'crate', 3, 2, {})]), north)).toBeNull();
  });

  it('only counts what E would act on: no plates/doors, no socketed cells, sockets need a cell, carried items excluded', () => {
    const p = actor('player');
    expect(targetedInteractable(view([p], [ent('plate', 'pressurePlate', 3, 2, {}), ent('door', 'door', 3, 2, {})]), p)).toBeNull();
    expect(targetedInteractable(view([p], [ent('cell', 'energyCell', 3, 2, { socketId: 's' }), ent('s', 'energySocket', 3, 2, { cellId: 'cell' })]), p)?.id).toBe('s');
    expect(targetedInteractable(view([p], [ent('s', 'energySocket', 3, 2, { cellId: null })]), p)).toBeNull();
    expect(targetedInteractable(view([p], [ent('k', 'crate', 3, 2, {}, 0, 'echo:1')]), p)).toBeNull();
  });

  it('carrying a cell: targets an empty socket, otherwise nothing (E would drop)', () => {
    const p = actor('player', { carrying: 'cell' });
    const cell = ent('cell', 'energyCell', 2, 2, { socketId: null }, 0, 'player');
    expect(targetedInteractable(view([p], [cell, ent('s', 'energySocket', 3, 2, { cellId: null })]), p)?.id).toBe('s');
    expect(targetedInteractable(view([p], [cell, ent('s', 'energySocket', 3, 2, { cellId: 'other' })]), p)).toBeNull();
    expect(targetedInteractable(view([p], [cell, ent('k', 'crate', 3, 2, {})]), p)).toBeNull();
  });

  it('lifts are interactable only in cycle mode (needs the authored definition)', () => {
    const p = actor('player');
    const v = view([p], [ent('lift', 'elevator', 2, 2, { y: 0 })]);
    expect(targetedInteractable(v, p)).toBeNull();
    const cycle = { id: 'lift', kind: 'elevator', col: 2, row: 2, config: { levels: [0, 1], mode: 'cycle' } } as EntityDefinition;
    const signal = { ...cycle, config: { levels: [0, 1], mode: 'signal' } } as EntityDefinition;
    expect(targetedInteractable(v, p, (id) => (id === 'lift' ? cycle : undefined))?.id).toBe('lift');
    expect(targetedInteractable(v, p, (id) => (id === 'lift' ? signal : undefined))).toBeNull();
  });
});

describe('look target: next echo-intent target when idle near one', () => {
  const sw = ent('sw', 'timedSwitch', 4, 4, { on: false }); // 2 tiles diagonal-ish from (2,2): within reach of the idle glance
  const far = ent('far', 'timedSwitch', 2 + Math.ceil(IDLE_NEAR_TILES) + 2, 2, { on: false });

  it('glances at the soonest upcoming echo interaction nearby while idle', () => {
    const p = actor('player', { facing: 0 });
    const v = view([actor('echo:1'), p], [sw, far], 100);
    const t = selectLookTarget(v, p, tl([track('echo:1', [[150, 'sw']])]));
    expect(t).toMatchObject({ entityId: 'sw', reason: 'echoIntent' });
  });

  it('ignores it while moving, when too far, outside the lookahead, already past, or for hidden echoes', () => {
    const p = actor('player', { facing: 0 });
    const echoes = tl([track('echo:1', [[150, 'sw']])]);
    expect(selectLookTarget(view([actor('echo:1'), actor('player', { facing: 0, moving: true })], [sw]), actor('player', { facing: 0, moving: true }), echoes)).toBeNull();
    expect(selectLookTarget(view([actor('echo:1'), p], [far]), p, tl([track('echo:1', [[150, 'far']])]))).toBeNull();
    expect(selectLookTarget(view([actor('echo:1'), p], [sw], 100), p, tl([track('echo:1', [[100 + LOOK_LOOKAHEAD_TICKS + 1, 'sw']])]))).toBeNull();
    expect(selectLookTarget(view([actor('echo:1'), p], [sw], 200), p, echoes)).toBeNull();
    expect(selectLookTarget(view([p], [sw], 100), p, echoes)).toBeNull(); // echo hidden on the timeline
    expect(selectLookTarget(view([actor('echo:1'), p], [sw], 100), p, null)).toBeNull();
  });

  it('picks the soonest of several echoes; an echo only follows its own track', () => {
    const sw2 = ent('sw2', 'timedSwitch', 1, 1, { on: false });
    const p = actor('player', { facing: 0 });
    const both = tl([track('echo:1', [[180, 'sw']]), track('echo:2', [[130, 'sw2']])]);
    const v = view([actor('echo:1'), actor('echo:2'), p], [sw, sw2], 100);
    expect(selectLookTarget(v, p, both)?.entityId).toBe('sw2');
    const e1 = actor('echo:1', { facing: 0 });
    expect(selectLookTarget(view([e1, actor('echo:2'), p], [sw, sw2], 100), e1, both)?.entityId).toBe('sw');
  });

  it('the targeted interactable always wins over an echo intent', () => {
    const p = actor('player'); // facing east → crate at (3,2)
    const v = view([actor('echo:1'), p], [sw, ent('k', 'crate', 3, 2, {})], 100);
    expect(selectLookTarget(v, p, tl([track('echo:1', [[120, 'sw']])]))).toMatchObject({ entityId: 'k', reason: 'targeted' });
  });
});
