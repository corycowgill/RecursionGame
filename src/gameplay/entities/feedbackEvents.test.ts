import { describe, expect, it } from 'vitest';
import type { EntityDefinition, LevelDefinition, SimEvent, SimView, Wire } from '../../engine/contracts';
import { createGame, playInputs, playScript } from '../../testing/harness/harness';
import { S, inputs } from '../../testing/harness/script';

/**
 * Round 4 feedback events: `gateBlocked` (a temporal gate held open by an occupant, mirrors doorBlocked) and
 * `elevatorHeld` (a lift starts waiting in place). Both are notifications only: they must not change behaviour,
 * the world hash or any golden replay (the golden replays in src/testing/replays verify the latter).
 */

function room(id: string, tiles: string[], entities: EntityDefinition[], o: { wires?: Wire[]; heights?: string[]; spawn: { col: number; row: number; facing?: 0 | 1 | 2 | 3 } }): LevelDefinition {
  const lvl: LevelDefinition = {
    id,
    order: 0,
    name: id,
    grid: { width: tiles[0]!.length, height: tiles.length, tiles },
    entities: [...entities, { id: 'exit', kind: 'exitPortal', col: 1, row: tiles.length - 2, config: {} }],
    wires: o.wires ?? [],
    playerSpawn: o.spawn,
    exitId: 'exit',
    maxEchoes: 3,
    loopDurationTicks: 3600,
    parTimeSeconds: 10,
    hints: [],
    solution: [[S.wait(1)]],
  };
  if (o.heights) lvl.grid.heights = o.heights;
  return lvl;
}

const gateRoom = () =>
  room(
    'fb-gate',
    ['########', '#......#', '#......#', '########'],
    [
      { id: 'sw', kind: 'timedSwitch', col: 1, row: 1, config: { durationTicks: 60 } },
      { id: 'gate', kind: 'temporalGate', col: 4, row: 1, config: { allows: 'all', requiresSignal: true } },
    ],
    { wires: [{ from: 'sw', to: 'gate' }], spawn: { col: 2, row: 1, facing: 3 } },
  );

const of = (events: readonly SimEvent[], type: SimEvent['type']) => events.filter((e) => e.type === type);
const gateState = (v: SimView) => (v.entities['gate'] as { state: { open: boolean; held?: boolean } }).state;

describe('gateBlocked event', () => {
  it('fires once when an occupant holds a closing gate open, then the gate closes when clear', () => {
    const game = createGame(gateRoom());
    // press the switch (gate opens), walk into the gate cell and stay while the 1 s switch runs out
    const a = playInputs(game, inputs().interact().wait(3).move(1, 0, 50).wait(100).build());
    expect(of(a.events, 'switchOff')).toHaveLength(1);
    const blocked = of(a.events, 'gateBlocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ entityId: 'gate' });
    // emitted after the switch went off (the hold starts when the signal drops)
    expect(blocked[0]!.tick).toBeGreaterThan(of(a.events, 'switchOff')[0]!.tick);
    expect(of(a.events, 'gateClose')).toHaveLength(0);
    expect(gateState(game.getState())).toMatchObject({ open: true, held: true });

    const b = playInputs(game, inputs().move(-1, 0, 30).wait(3).build());
    expect(of(b.events, 'gateClose')).toHaveLength(1);
    expect(of(b.events, 'gateBlocked')).toHaveLength(0);
    expect(gateState(game.getState())).toMatchObject({ open: false, held: false });
  });

  it('does not fire when the gate closes on an empty cell', () => {
    const game = createGame(gateRoom());
    const r = playInputs(game, inputs().interact().wait(120).build());
    expect(of(r.events, 'gateClose')).toHaveLength(1);
    expect(of(r.events, 'gateBlocked')).toHaveLength(0);
    expect(gateState(game.getState()).held).toBeUndefined(); // the state shape is untouched until a hold happens
  });

  it('fires again for a second, separate hold (re-armed by the signal)', () => {
    const game = createGame(gateRoom());
    // hold #1
    const a = playInputs(game, inputs().interact().wait(3).move(1, 0, 50).wait(100).build());
    expect(of(a.events, 'gateBlocked')).toHaveLength(1);
    // walk out (gate closes), back to the switch, press, walk in again and wait
    const b = playScript(game, [S.moveTo(2, 1), S.face(3), S.interact(), S.wait(3), S.move(1, 0, 50), S.wait(100)]);
    expect(of(b.events, 'gateClose').length).toBeGreaterThanOrEqual(1);
    expect(of(b.events, 'gateBlocked')).toHaveLength(1);
  });

  it('an echo standing in the gate raises it on replay too', () => {
    const game = createGame(gateRoom());
    playInputs(game, inputs().interact().wait(3).move(1, 0, 50).wait(20).build());
    expect(game.commitLoopAndRewind()).toBe(true);
    const r = playInputs(game, inputs().wait(200).build());
    expect(of(r.events, 'gateBlocked')).toHaveLength(1);
  });

  it('the held flag is not hashed: the world hash equals the hash of the same state without it', () => {
    const game = createGame(gateRoom());
    playInputs(game, inputs().interact().wait(3).move(1, 0, 50).wait(100).build());
    const live = game.getState();
    expect(gateState(live).held).toBe(true);
    const copy = JSON.parse(JSON.stringify(live)) as { entities: Record<string, { state: Record<string, unknown> }> };
    delete copy.entities['gate']!.state['held'];
    expect(game.hashOf(copy as unknown as SimView)).toBe(game.hash());
    copy.entities['gate']!.state['held'] = false;
    expect(game.hashOf(copy as unknown as SimView)).toBe(game.hash());
  });

  it('behaviour is unchanged: positions and hashes match a run whose events are ignored', () => {
    // two identical runs must agree tick for tick (events are a side channel only)
    const script = inputs().interact().wait(3).move(1, 0, 50).wait(100).move(-1, 0, 30).wait(10).build();
    const g1 = createGame(gateRoom());
    const g2 = createGame(gateRoom());
    for (const inp of script) {
      g1.step(inp);
      g2.step(inp);
      g2.drainEvents();
      expect(g1.hash()).toBe(g2.hash());
    }
  });
});

describe('elevatorHeld event', () => {
  const liftRoom = () =>
    room('fb-lift', ['#######', '#.._..#', '#.....#', '#######'], [{ id: 'lift', kind: 'elevator', col: 3, row: 1, level: 0, config: { levels: [0, 1], mode: 'cycle' } }], {
      heights: ['0000000', '0000110', '0000000', '0000000'],
      spawn: { col: 1, row: 1, facing: 1 },
    });

  it('fires once when a departure is held by someone straddling the shaft edge', () => {
    const game = createGame(liftRoom());
    const r = playScript(game, [S.moveTo(2, 1), S.move(1, 0, 7), S.interact(), S.wait(30)]);
    const held = of(r.events, 'elevatorHeld');
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ entityId: 'lift', y: 0 });
    expect(of(r.events, 'elevatorStart')).toHaveLength(0);
    // stepping back releases it: the lift departs, no new held event
    const b = playScript(game, [S.move(-1, 0, 10), S.wait(80)]);
    expect(of(b.events, 'elevatorStart')).toHaveLength(1);
    expect(of(b.events, 'elevatorHeld')).toHaveLength(0);
  });

  it('does not fire on an unobstructed ride', () => {
    const game = createGame(liftRoom());
    const r = playScript(game, [S.moveTo(3, 1), S.interact(), S.wait(80)]);
    expect(of(r.events, 'elevatorStart')).toHaveLength(1);
    expect(of(r.events, 'elevatorHeld')).toHaveLength(0);
  });
});
