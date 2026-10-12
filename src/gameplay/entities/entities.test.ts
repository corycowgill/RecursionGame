import { describe, expect, it } from 'vitest';
import {
  DOOR_PASSABLE_PROGRESS,
  ENTITY_KINDS,
  type EntityDefinition,
  type LevelDefinition,
  type SimEvent,
  type SimView,
  type Wire,
} from '../../engine/contracts';
import { createGame, playInputs, playScript, runScripts } from '../../testing/harness/harness';
import { S, inputs } from '../../testing/harness/script';
import { createDefaultRegistry } from './index';

/* ------------------------------------------------------------------------------------------------
 * Tiny synthetic chambers for component tests.
 * ---------------------------------------------------------------------------------------------- */

interface FixtureOpts {
  tiles: string[];
  heights?: string[];
  entities: EntityDefinition[];
  wires?: Wire[];
  spawn: { col: number; row: number; facing?: 0 | 1 | 2 | 3 };
  exit: { col: number; row: number };
  maxEchoes?: number;
}

function fixture(id: string, o: FixtureOpts): LevelDefinition {
  const lvl: LevelDefinition = {
    id,
    order: 0,
    name: id,
    grid: { width: o.tiles[0]!.length, height: o.tiles.length, tiles: o.tiles },
    entities: [...o.entities, { id: 'exit', kind: 'exitPortal', col: o.exit.col, row: o.exit.row, config: {} }],
    wires: o.wires ?? [],
    playerSpawn: o.spawn,
    exitId: 'exit',
    maxEchoes: o.maxEchoes ?? 3,
    loopDurationTicks: 3600,
    parTimeSeconds: 10,
    hints: [],
    solution: [[S.wait(1)]],
  };
  if (o.heights) lvl.grid.heights = o.heights;
  return lvl;
}

const ent = <T extends EntityDefinition>(e: T): T => e;
const types = (events: readonly SimEvent[]): string[] => events.map((e) => e.type);
function entity<K extends EntityDefinition['kind']>(view: SimView, id: string, kind: K) {
  const e = view.entities[id];
  if (!e || e.kind !== kind) throw new Error(`no ${kind} '${id}'`);
  return e as Extract<SimView['entities'][string], { kind: K }>;
}
const player = (view: SimView) => view.actors[view.actors.length - 1]!;

/* ------------------------------------------------------------------------------------------------ */

describe('registry', () => {
  it('registers a behaviour for every entity kind (12 core + round-6 expansion)', () => {
    const reg = createDefaultRegistry();
    for (const k of ENTITY_KINDS) expect(reg.has(k), k).toBe(true);
    expect(reg.kinds().length).toBe(ENTITY_KINDS.length);
  });
});

describe('pressure plate', () => {
  const plateRoom = (cfg: object = {}) =>
    fixture('plate', {
      tiles: ['########', '#......#', '#......#', '########'],
      entities: [
        ent({ id: 'plate', kind: 'pressurePlate', col: 4, row: 1, config: cfg }),
        ent({ id: 'crate', kind: 'crate', col: 2, row: 2, config: {} }),
      ],
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 6, row: 2 },
    });

  it('is pressed by an actor standing on it and released when they leave', () => {
    const game = createGame(plateRoom());
    const on = playScript(game, [S.moveTo(4, 1), S.wait(2)]);
    expect(types(on.events)).toContain('plateDown');
    expect(entity(game.getState(), 'plate', 'pressurePlate').state.pressed).toBe(true);
    expect(game.getState().signals['plate']).toBe(true);
    const off = playScript(game, [S.moveTo(5, 1), S.wait(2)]);
    expect(types(off.events)).toContain('plateUp');
    expect(game.getState().signals['plate']).toBe(false);
  });

  it('is pressed by a crate resting on it (and stays pressed after the carrier leaves)', () => {
    const game = createGame(plateRoom());
    playScript(game, [S.moveTo(1, 2), S.face(1), S.interact(), S.moveTo(3, 1), S.face(1), S.interact(), S.moveTo(1, 1), S.wait(3)]);
    const plate = entity(game.getState(), 'plate', 'pressurePlate');
    expect(game.getState().entities['crate']!.carriedBy).toBeNull();
    expect(plate.state.occupants).toBe(1);
    expect(plate.state.pressed).toBe(true);
  });

  it('ignores crates when acceptsCrates is false and honours threshold / latch', () => {
    const game = createGame(plateRoom({ acceptsCrates: false }));
    playScript(game, [S.moveTo(1, 2), S.face(1), S.interact(), S.moveTo(3, 1), S.face(1), S.interact(), S.moveTo(1, 1), S.wait(3)]);
    expect(entity(game.getState(), 'plate', 'pressurePlate').state.pressed).toBe(false);

    const heavy = createGame(plateRoom({ threshold: 2 }));
    playScript(heavy, [S.moveTo(4, 1), S.wait(3)]);
    expect(entity(heavy.getState(), 'plate', 'pressurePlate').state.pressed).toBe(false);

    const latch = createGame(plateRoom({ latch: true }));
    playScript(latch, [S.moveTo(4, 1), S.moveTo(6, 1), S.wait(3)]);
    expect(entity(latch.getState(), 'plate', 'pressurePlate').state.pressed).toBe(true);
  });
});

describe('door', () => {
  const doorRoom = (startsOpen = false) =>
    fixture('door', {
      tiles: ['#######', '#.....#', '###.###', '#.....#', '#######'],
      entities: [
        ent({ id: 'plate', kind: 'pressurePlate', col: 1, row: 1, config: {} }),
        ent({ id: 'door', kind: 'door', col: 3, row: 2, config: startsOpen ? { startsOpen: true } : {} }),
      ],
      wires: [{ from: 'plate', to: 'door' }],
      spawn: { col: 3, row: 1, facing: 2 },
      exit: { col: 5, row: 3 },
      maxEchoes: 2,
    });

  it('stays closed and solid without power', () => {
    const game = createGame(doorRoom());
    playScript(game, [S.move(0, 1, 60)]);
    expect(player(game.getState()).z).toBeLessThan(2000);
    expect(entity(game.getState(), 'door', 'door').state.progress).toBe(0);
  });

  it('opens while powered and never closes on an occupant (deterministic blocking)', () => {
    // Echo holds the plate for 80 ticks then walks away; the player parks in the doorway.
    const res = runScripts(doorRoom(), [
      [S.moveTo(1, 1), S.wait(50), S.moveTo(2, 1)],
      [S.wait(40), S.moveTo(3, 2), S.wait(120)],
    ]);
    const final = res.passes[1]!;
    expect(types(final.events)).toContain('doorOpen');
    expect(types(final.events)).toContain('doorBlocked');
    const door = entity(res.game.getState(), 'door', 'door');
    expect(door.state.open).toBe(false); // wants to close…
    expect(door.state.blocked).toBe(true); // …but the player is in the doorway
    expect(door.state.progress).toBeGreaterThanOrEqual(DOOR_PASSABLE_PROGRESS - 100);
    // Once the doorway clears, it closes.
    playScript(res.game, [S.moveTo(3, 3), S.wait(30)]);
    expect(entity(res.game.getState(), 'door', 'door').state.progress).toBe(0);
  });

  it('startsOpen inverts the signal', () => {
    const game = createGame(doorRoom(true));
    playScript(game, [S.wait(2)]);
    expect(entity(game.getState(), 'door', 'door').state.progress).toBe(1000);
    playScript(game, [S.moveTo(1, 1), S.wait(30)]);
    expect(entity(game.getState(), 'door', 'door').state.progress).toBe(0);
  });
});

describe('timed switch', () => {
  const switchRoom = (cfg: { durationTicks: number; retrigger?: boolean }) =>
    fixture('switch', {
      tiles: ['#######', '#.....#', '#.....#', '#######'],
      entities: [ent({ id: 'sw', kind: 'timedSwitch', col: 3, row: 1, config: cfg })],
      spawn: { col: 2, row: 1, facing: 1 },
      exit: { col: 5, row: 2 },
    });

  it('is on for exactly durationTicks after interaction, then turns itself off', () => {
    const game = createGame(switchRoom({ durationTicks: 90 }));
    const seq = inputs().interact().wait(200).build();
    const outputs: boolean[] = [];
    const events: SimEvent[] = [];
    for (const i of seq) {
      const r = game.step(i);
      events.push(...r.events);
      outputs.push(game.getState().signals['sw'] === true);
    }
    expect(outputs.filter(Boolean).length).toBe(90);
    expect(outputs[0]).toBe(true);
    expect(outputs[89]).toBe(true);
    expect(outputs[90]).toBe(false);
    expect(types(events)).toEqual(expect.arrayContaining(['switchOn', 'switchTick', 'switchOff']));
    expect(events.find((e) => e.type === 'interact')).toMatchObject({ kind: 'use', entityId: 'sw' });
  });

  it('retrigger restarts the timer; retrigger:false makes a second press fail (busy)', () => {
    const game = createGame(switchRoom({ durationTicks: 60 }));
    playInputs(game, inputs().interact().wait(40).interact().wait(50).build());
    expect(game.getState().signals['sw']).toBe(true); // 40 + 50 > 60 but the timer restarted at 41

    const strict = createGame(switchRoom({ durationTicks: 60, retrigger: false }));
    const r = playInputs(strict, inputs().interact().wait(10).interact().build());
    const failed = r.events.find((e) => e.type === 'interactFailed');
    expect(failed).toMatchObject({ entityId: 'sw', reason: 'busy' });
  });

  it('is solid (a console you face, not a floor button)', () => {
    const game = createGame(switchRoom({ durationTicks: 60 }));
    playScript(game, [S.move(1, 0, 60)]);
    expect(player(game.getState()).x).toBe(3000 - 280);
  });
});

describe('energy cell + socket', () => {
  const socketRoom = (socketCfg: object = {}, cellCfg: object = {}, extra: EntityDefinition[] = []) =>
    fixture('socket', {
      tiles: ['########', '#......#', '#......#', '########'],
      entities: [
        ent({ id: 'cell', kind: 'energyCell', col: 2, row: 1, config: cellCfg }),
        ent({ id: 'socket', kind: 'energySocket', col: 5, row: 1, config: socketCfg }),
        ...extra,
      ],
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 6, row: 2 },
    });
  const insertScript = [S.interact(), S.moveTo(4, 1), S.face(1), S.interact(), S.wait(2)];

  it('a carried cell inserted into a socket powers it; extracting it unpowers it', () => {
    const game = createGame(socketRoom());
    const r = playScript(game, insertScript);
    expect(types(r.events)).toEqual(expect.arrayContaining(['pickup', 'cellInserted']));
    const v = game.getState();
    expect(entity(v, 'socket', 'energySocket').state).toMatchObject({ cellId: 'cell', powered: true });
    expect(entity(v, 'cell', 'energyCell').state.socketId).toBe('socket');
    expect(v.signals['socket']).toBe(true);
    expect(player(v).carrying).toBeNull();

    const out = playScript(game, [S.interact(), S.wait(2)]);
    expect(out.events.find((e) => e.type === 'interact')).toMatchObject({ kind: 'extract', entityId: 'socket' });
    expect(types(out.events)).toContain('cellRemoved');
    expect(player(game.getState()).carrying).toBe('cell');
    expect(game.getState().signals['socket']).toBe(false);
  });

  it('a seated cell cannot be picked up directly and a locked socket refuses extraction', () => {
    const game = createGame(socketRoom({ allowExtract: false }));
    playScript(game, insertScript);
    const r = playScript(game, [S.interact()]);
    expect(r.events.find((e) => e.type === 'interactFailed')).toMatchObject({ entityId: 'socket', reason: 'locked' });
    expect(player(game.getState()).carrying).toBeNull();
  });

  it('rejects cells with the wrong tag, accepts the right one', () => {
    const wrong = createGame(socketRoom({ requiresTag: 'violet' }, { tag: 'teal' }));
    const r = playScript(wrong, insertScript);
    expect(r.events.find((e) => e.type === 'interactFailed')).toMatchObject({ reason: 'rejected' });
    expect(player(wrong.getState()).carrying).toBe('cell');

    const right = createGame(socketRoom({ requiresTag: 'violet' }, { tag: 'violet' }));
    playScript(right, insertScript);
    expect(right.getState().signals['socket']).toBe(true);
  });

  it('initialCell starts seated and powered; cells are light (do not press plates) and not solid', () => {
    const lvl = fixture('socket-init', {
      tiles: ['########', '#......#', '#......#', '########'],
      entities: [
        ent({ id: 'cell', kind: 'energyCell', col: 5, row: 1, config: {} }),
        ent({ id: 'socket', kind: 'energySocket', col: 5, row: 1, config: { initialCell: 'cell' } }),
        ent({ id: 'cell-2', kind: 'energyCell', col: 3, row: 1, config: {} }),
        ent({ id: 'plate', kind: 'pressurePlate', col: 3, row: 1, config: {} }),
      ],
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 6, row: 2 },
    });
    const game = createGame(lvl);
    expect(game.getState().signals['socket']).toBe(true);
    playScript(game, [S.wait(3)]);
    expect(entity(game.getState(), 'plate', 'pressurePlate').state.pressed).toBe(false);
    playScript(game, [S.moveTo(3, 1), S.wait(2)]); // walk over the resting cell onto the plate
    expect(player(game.getState()).x).toBe(3500);
    expect(game.getState().signals['socket']).toBe(true);
  });
});

describe('elevator', () => {
  // Lower floor (h0) cols 1-2, shaft col 3, upper floor (h1) cols 4-5.
  const tiles = ['#######', '#.._..#', '#######'];
  const heights = ['0000000', '0000110', '0000000'];
  const lift = (cfg: object, extra: EntityDefinition[] = [], wires: Wire[] = []) =>
    fixture('lift', {
      tiles,
      heights,
      entities: [ent({ id: 'lift', kind: 'elevator', col: 3, row: 1, level: 0, config: { levels: [0, 1], ...cfg } }), ...extra],
      wires,
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 5, row: 1 },
    });

  it('ride mode: standing on it lifts the rider to the upper floor', () => {
    const game = createGame(lift({ mode: 'ride', rideDelayTicks: 20 }));
    const r = playScript(game, [S.moveTo(3, 1), S.wait(100), S.moveTo(5, 1)]);
    expect(types(r.events)).toEqual(expect.arrayContaining(['elevatorStart', 'elevatorArrive', 'levelComplete']));
    expect(player(game.getState()).y).toBe(1000);
  });

  it('a ledge blocks the upper floor while the platform is down', () => {
    const game = createGame(lift({ mode: 'signal' }));
    playScript(game, [S.moveTo(3, 1), S.move(1, 0, 60)]);
    expect(player(game.getState()).x).toBe(4000 - 280);
    expect(player(game.getState()).y).toBe(0);
  });

  it('cycle mode: E on the platform advances it; busy while travelling', () => {
    const game = createGame(lift({ mode: 'cycle', ticksPerLevel: 40 }));
    const r = playScript(game, [S.moveTo(3, 1), S.interact(), S.wait(5), S.interact(), S.wait(60)]);
    expect(r.events.find((e) => e.type === 'interact')).toMatchObject({ kind: 'use', entityId: 'lift' });
    expect(r.events.find((e) => e.type === 'interactFailed')).toMatchObject({ reason: 'busy' });
    expect(entity(game.getState(), 'lift', 'elevator').state.y).toBe(1000);
    expect(player(game.getState()).y).toBe(1000);
  });

  it('signal mode follows its wired input', () => {
    const game = createGame(
      lift({ mode: 'signal', ticksPerLevel: 30 }, [ent({ id: 'plate', kind: 'pressurePlate', col: 1, row: 1, config: {} })], [
        { from: 'plate', to: 'lift' },
      ]),
    );
    playScript(game, [S.wait(40)]);
    expect(entity(game.getState(), 'lift', 'elevator').state.y).toBe(1000);
    expect(game.getState().signals['lift']).toBe(true);
    playScript(game, [S.moveTo(2, 1), S.wait(40)]);
    expect(entity(game.getState(), 'lift', 'elevator').state.y).toBe(0);
  });

  it('holds its departure while an actor straddles the shaft edge', () => {
    const game = createGame(lift({ mode: 'cycle' }));
    playScript(game, [S.moveTo(2, 1), S.move(1, 0, 7), S.interact(), S.wait(30)]);
    const held = entity(game.getState(), 'lift', 'elevator').state;
    expect(held.targetIndex).toBe(1);
    expect(held.held).toBe(true);
    expect(held.y).toBe(0);
    playScript(game, [S.move(-1, 0, 10), S.wait(80)]);
    expect(entity(game.getState(), 'lift', 'elevator').state.y).toBe(1000);
  });

  it('a crate resting on the platform rides with it', () => {
    const game = createGame(lift({ mode: 'ride', rideDelayTicks: 10 }, [ent({ id: 'crate', kind: 'crate', col: 2, row: 1, config: {} })]));
    playScript(game, [S.interact(), S.moveTo(2, 1), S.face(1), S.interact(), S.wait(100)]);
    const crate = game.getState().entities['crate']!;
    expect(crate.carriedBy).toBeNull();
    expect(crate.x).toBe(3500);
    expect(crate.y).toBe(1000);
  });
});

describe('laser emitter + receiver', () => {
  const laserRoom = (extra: EntityDefinition[] = [], wires: Wire[] = [], emitterCfg: object = {}) =>
    fixture('laser', {
      tiles: ['#########', '#.......#', '#.......#', '#########'],
      entities: [
        ent({ id: 'emitter', kind: 'laserEmitter', col: 1, row: 1, facing: 1, config: emitterCfg }),
        ent({ id: 'receiver', kind: 'laserReceiver', col: 7, row: 1, config: {} }),
        ...extra,
      ],
      wires,
      spawn: { col: 4, row: 2, facing: 0 },
      exit: { col: 7, row: 2 },
    });

  it('a beam across the room lights the receiver, whose output drives wires', () => {
    const game = createGame(laserRoom([ent({ id: 'door', kind: 'door', col: 6, row: 2, config: {} })], [{ from: 'receiver', to: 'door' }]));
    const r = playScript(game, [S.wait(40)]);
    const v = game.getState();
    expect(entity(v, 'emitter', 'laserEmitter').state).toMatchObject({ on: true, hitEntityId: 'receiver', beamLength: 6000 });
    expect(entity(v, 'receiver', 'laserReceiver').state.lit).toBe(true);
    expect(entity(v, 'door', 'door').state.progress).toBe(1000);
    expect(types(r.events)).toEqual(expect.arrayContaining(['laserOn', 'receiverLit', 'doorOpen']));
  });

  it('actors block the beam at their near face', () => {
    const game = createGame(laserRoom());
    playScript(game, [S.moveTo(4, 1), S.wait(2)]);
    const st = entity(game.getState(), 'emitter', 'laserEmitter').state;
    expect(st.hitActorId).toBe('player');
    expect(st.beamLength).toBe(3000 - 280);
    expect(entity(game.getState(), 'receiver', 'laserReceiver').state.lit).toBe(false);
  });

  it('a crate dropped in the beam blocks it; walls stop it; a wired emitter is off without power', () => {
    const game = createGame(laserRoom([ent({ id: 'crate', kind: 'crate', col: 3, row: 2, config: {} })]));
    playScript(game, [S.moveTo(4, 2), S.face(3), S.interact(), S.moveTo(5, 2), S.face(0), S.interact(), S.wait(2)]);
    const st = entity(game.getState(), 'emitter', 'laserEmitter').state;
    expect(st.hitEntityId).toBe('crate');
    expect(st.beamLength).toBe(4000 - 400);

    const wall = createGame(
      fixture('laser-wall', {
        tiles: ['#######', '#..#..#', '#.....#', '#######'],
        entities: [ent({ id: 'emitter', kind: 'laserEmitter', col: 1, row: 1, facing: 1, config: {} })],
        spawn: { col: 1, row: 2 },
        exit: { col: 5, row: 2 },
      }),
    );
    playScript(wall, [S.wait(2)]);
    expect(entity(wall.getState(), 'emitter', 'laserEmitter').state).toMatchObject({ beamLength: 1500, hitEntityId: null });

    const wired = createGame(laserRoom([ent({ id: 'plate', kind: 'pressurePlate', col: 2, row: 2, config: {} })], [{ from: 'plate', to: 'emitter' }]));
    playScript(wired, [S.wait(5)]);
    expect(entity(wired.getState(), 'emitter', 'laserEmitter').state.on).toBe(false);
    playScript(wired, [S.moveTo(2, 2), S.wait(3)]);
    expect(entity(wired.getState(), 'receiver', 'laserReceiver').state.lit).toBe(true);
  });
});

describe('temporal gate', () => {
  const gateRoom = (allows: 'echoes' | 'player' | 'all', extra: EntityDefinition[] = [], wires: Wire[] = []) =>
    fixture('gate', {
      tiles: ['#######', '#.....#', '#.....#', '#######'],
      entities: [ent({ id: 'gate', kind: 'temporalGate', col: 3, row: 1, config: { allows } }), ...extra],
      wires,
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 5, row: 2 },
    });

  it("allows:'echoes' blocks the live player but lets the echo of the same recording through", () => {
    const res = runScripts(gateRoom('echoes'), [[S.move(1, 0, 120)], [S.move(1, 0, 120)]]);
    const v = res.game.getState();
    const echo = v.actors[0]!;
    expect(echo.kind).toBe('echo');
    expect(echo.x).toBe(6000 - 280); // passed the gate, stopped by the far wall
    expect(player(v).x).toBe(3000 - 280); // blocked at the field
  });

  it("allows:'player' lets the player through but stops echoes", () => {
    const res = runScripts(gateRoom('player'), [[S.move(1, 0, 120)], [S.move(1, 0, 120)]]);
    const v = res.game.getState();
    expect(v.actors[0]!.x).toBe(3000 - 280);
    expect(player(v).x).toBe(6000 - 280);
  });

  it('a wired gate blocks everyone while unpowered and nothing can be dropped into it', () => {
    const game = createGame(
      gateRoom('all', [ent({ id: 'plate', kind: 'pressurePlate', col: 1, row: 2, config: {} }), ent({ id: 'crate', kind: 'crate', col: 2, row: 2, config: {} })], [
        { from: 'plate', to: 'gate' },
      ]),
    );
    playScript(game, [S.move(1, 0, 80)]);
    expect(player(game.getState()).x).toBe(3000 - 280);
    expect(game.getState().signals['gate']).toBe(false);
    const r = playScript(game, [S.moveTo(2, 1), S.face(2), S.interact(), S.face(1), S.interact()]);
    expect(r.events.find((e) => e.type === 'interactFailed')).toMatchObject({ entityId: 'crate', reason: 'occupied' });
  });
});

describe('moving platform', () => {
  // Dock (1,1) — void cols 2..5 — dock cols 6..7.
  const platformRoom = (extra: EntityDefinition[] = [], cfg: object = {}) =>
    fixture('platform', {
      tiles: ['#########', '#.____..#', '#########'],
      entities: [
        ent({
          id: 'deck',
          kind: 'movingPlatform',
          col: 2,
          row: 1,
          level: 0,
          config: { path: [{ col: 2, row: 1 }, { col: 5, row: 1 }], speed: 20, pauseTicks: 60, ...cfg },
        }),
        ...extra,
      ],
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 7, row: 1 },
    });

  it('the docked deck makes its void cell walkable', () => {
    const lvl = platformRoom([], { path: [{ col: 2, row: 1 }, { col: 3, row: 1 }] });
    const game = createGame(lvl);
    playScript(game, [S.move(1, 0, 25), S.wait(5)]);
    expect(player(game.getState()).x).toBe(2500); // stepped onto the docked deck
  });

  it('carries a rider across the void to the far dock on a deterministic cycle', () => {
    const lvl = platformRoom();
    const a = runScripts(lvl, [[S.moveTo(2, 1), S.wait(200), S.moveTo(7, 1)]]);
    const b = runScripts(lvl, [[S.moveTo(2, 1), S.wait(200), S.moveTo(7, 1)]]);
    expect(a.completed).toBe(true);
    expect(a.passes[0]!.hashes).toEqual(b.passes[0]!.hashes);
    expect(types(a.passes[0]!.events)).toEqual(expect.arrayContaining(['platformDepart', 'platformArrive']));
  });

  it('a rider who stays put returns with the deck (pingpong)', () => {
    const game = createGame(platformRoom());
    // depart at 60, arrive at 210, wait 60, return 270..420
    playScript(game, [S.moveTo(2, 1), S.waitUntil(450)]);
    expect(player(game.getState()).x).toBe(2500);
    expect(entity(game.getState(), 'deck', 'movingPlatform').x).toBe(2500);
  });

  it('a crate resting on the deck rides along', () => {
    const game = createGame(platformRoom([ent({ id: 'crate', kind: 'crate', col: 1, row: 1, config: {} })]));
    // spawn is on (1,1) too: pick the crate up from our own cell? Instead: crate dropped onto the deck.
    playScript(game, [S.interact(), S.face(1), S.wait(1)]);
    const r = playScript(game, [S.interact(), S.waitUntil(230)]);
    expect(types(r.events)).toContain('drop');
    const crate = game.getState().entities['crate']!;
    expect(crate.x).toBe(5500);
    expect(crate.y).toBe(0);
  });
});

describe('exit portal', () => {
  const portalRoom = () =>
    fixture('portal', {
      tiles: ['#######', '#.....#', '#.....#', '#######'],
      entities: [ent({ id: 'plate', kind: 'pressurePlate', col: 1, row: 2, config: {} })],
      wires: [{ from: 'plate', to: 'exit' }],
      spawn: { col: 1, row: 1, facing: 1 },
      exit: { col: 5, row: 1 },
    });

  it('only completes when its conditions are met while the player stands on it', () => {
    const solo = runScripts(portalRoom(), [[S.moveTo(5, 1), S.wait(30)]]);
    expect(solo.completed).toBe(false);
    expect(entity(solo.game.getState(), 'exit', 'exitPortal').state.active).toBe(false);

    const duo = runScripts(portalRoom(), [[S.moveTo(1, 2), S.wait(10)], [S.moveTo(5, 1), S.wait(5)]]);
    expect(duo.completed).toBe(true);
    expect(types(duo.passes[1]!.events)).toEqual(expect.arrayContaining(['portalActivated', 'levelComplete']));
  });

  it('echoes standing on the exit never complete the level', () => {
    const res = runScripts(portalRoom(), [[S.moveTo(5, 1), S.wait(10)], [S.moveTo(1, 2), S.wait(60)]]);
    expect(res.completed).toBe(false);
  });
});
