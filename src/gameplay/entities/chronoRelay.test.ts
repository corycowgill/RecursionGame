import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type EntityDefinition, type LevelDefinition, type SimEvent, type Wire } from '../../engine/contracts';
import { createGame, playInputs, playScript, replayLoops } from '../../testing/harness/harness';
import { S, inputs } from '../../testing/harness/script';
import { chronoRelayBehaviour } from './chronoRelay';
import { ent, entityOf, mini, named } from './testkit';

/**
 * CHRONO RELAY (round 6): delayed signal line. Room layout (row 1 is the walkway):
 *   ##########
 *   #S.P.W...#   S spawn (1,1)  P plate (3,1)  W timed switch (5,1, solid console)
 *   #........#
 *   #..D.E...#   D door (3,3) fed by the relay, E door (5,3) fed directly
 *   ##########   relay sits on the wall cell (8,0)
 */
const DELAY = 60;

function relayRoom(opts: { relay?: Partial<{ delayTicks: number; initialOn: boolean }>; source?: 'plate' | 'switch'; wires?: Wire[]; extra?: EntityDefinition[]; logic?: 'and' | 'or' } = {}): LevelDefinition {
  const src = opts.source ?? 'plate';
  const relay = ent({
    id: 'relay',
    kind: 'chronoRelay',
    col: 8,
    row: 0,
    config: { delayTicks: opts.relay?.delayTicks ?? DELAY, ...(opts.relay?.initialOn !== undefined ? { initialOn: opts.relay.initialOn } : {}) },
    ...(opts.logic ? { logic: opts.logic } : {}),
  });
  return mini('relay-room', {
    tiles: ['##########', '#........#', '#........#', '#........#', '##########'],
    entities: [
      ent({ id: 'plate', kind: 'pressurePlate', col: 3, row: 1, config: {} }),
      ent({ id: 'switch', kind: 'timedSwitch', col: 5, row: 1, config: { durationTicks: 120, retrigger: false } }),
      ent({ id: 'door-delayed', kind: 'door', col: 3, row: 3, config: { openTicks: 1 } }),
      ent({ id: 'door-direct', kind: 'door', col: 5, row: 3, config: { openTicks: 1 } }),
      relay,
      ...(opts.extra ?? []),
    ],
    wires: opts.wires ?? [
      { from: src, to: 'relay' },
      { from: 'relay', to: 'door-delayed' },
      { from: src, to: 'door-direct' },
    ],
    spawn: { col: 1, row: 1, facing: 1 },
    exit: { col: 8, row: 3 },
  });
}

const firstTick = (ev: readonly SimEvent[], type: string, id: string): number =>
  ev.find((e) => e.type === type && 'entityId' in e && e.entityId === id)?.tick ?? -1;

/** Per-tick signal trace of one entity over a whole pass (signals after each tick). */
function trace(level: LevelDefinition, script: Parameters<typeof playScript>[1], ticks: number, id: string): boolean[] {
  const game = createGame(level);
  const out: boolean[] = [];
  const pass = playScript(game, script);
  void pass;
  // Re-simulate deterministically to sample every tick.
  const replay = createGame(level);
  for (let t = 0; t < ticks; t++) {
    playInputs(replay, [pass.inputs[t] ?? { ...IDLE_INPUT, tick: t }], 1);
    out.push(replay.getState().signals[id] === true);
  }
  return out;
}

describe('chrono relay', () => {
  it('delays the signal by exactly delayTicks + 1 ticks compared with a direct wire', () => {
    const game = createGame(relayRoom());
    const pass = playScript(game, [S.moveTo(3, 1), S.wait(DELAY + 20)]);
    const down = firstTick(pass.events, 'plateDown', 'plate');
    const direct = firstTick(pass.events, 'doorOpen', 'door-direct');
    const delayed = firstTick(pass.events, 'doorOpen', 'door-delayed');
    expect(down).toBeGreaterThan(0);
    expect(direct).toBe(down + 1);
    expect(delayed).toBe(down + 2 + DELAY);
    expect(delayed - direct).toBe(DELAY + 1);
    // feedback events: one arm when the edge enters, one emit when it lands
    expect(named(pass.events, 'relayArm').map((e) => e.tick)).toEqual([down + 1]);
    expect(named(pass.events, 'relayEmit').map((e) => [e.tick, e.value])).toEqual([[down + 1 + DELAY, 1]]);
  });

  it('preserves the pulse shape: a 120-tick switch pulse arrives as a 120-tick pulse', () => {
    const level = relayRoom({ source: 'switch' });
    const script = [S.moveTo(4, 1), S.face(1), S.interact(), S.wait(400)];
    const sw = trace(level, script, 400, 'switch');
    const rl = trace(level, script, 400, 'relay');
    const on = (xs: boolean[]) => xs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const a = on(sw);
    const b = on(rl);
    expect(a.length).toBe(120);
    expect(b.length).toBe(120);
    // contiguous, shifted by exactly delayTicks + 1 (one hop into the relay, delayTicks inside it)
    expect(b).toEqual(a.map((t) => t + DELAY + 1));
  });

  it('initialOn with a source that is off at tick 0: on at once, falls after the delay', () => {
    const level = relayRoom({ relay: { initialOn: true } });
    const game = createGame(level);
    expect(game.getState().signals['relay']).toBe(true);
    playInputs(game, [], DELAY); // ticks 0 .. DELAY-1
    expect(game.getState().signals['relay']).toBe(true);
    playInputs(game, [], 1); // tick DELAY: the edge pushed on tick 0 lands
    expect(game.getState().signals['relay']).toBe(false);
    expect(entityOf(game.getState(), 'relay', 'chronoRelay').state.pending).toEqual([]);
  });

  it('honours an inverted input wire (rises after the delay while the source is off)', () => {
    const level = relayRoom({ wires: [{ from: 'plate', to: 'relay', invert: true }] });
    const game = createGame(level);
    playInputs(game, [], DELAY);
    expect(game.getState().signals['relay']).toBe(false);
    playInputs(game, [], 1);
    expect(game.getState().signals['relay']).toBe(true);
  });

  it('can drive a consumer through an inverted output wire', () => {
    const level = relayRoom({ wires: [{ from: 'plate', to: 'relay' }, { from: 'relay', to: 'door-delayed', invert: true }] });
    const game = createGame(level);
    playInputs(game, [], 5);
    expect(entityOf(game.getState(), 'door-delayed', 'door').state.open).toBe(true);
    const pass = playScript(game, [S.moveTo(3, 1), S.wait(DELAY + 10)]);
    expect(firstTick(pass.events, 'doorClose', 'door-delayed')).toBe(firstTick(pass.events, 'plateDown', 'plate') + DELAY + 2);
  });

  it('combines several inputs with def.logic (and / or)', () => {
    const wires: Wire[] = [
      { from: 'plate', to: 'relay' },
      { from: 'switch', to: 'relay' },
    ];
    const script = [S.moveTo(4, 1), S.face(1), S.interact(), S.wait(DELAY + 10)];
    // the walk crosses the plate, then presses the switch: never both at once
    const andPass = playScript(createGame(relayRoom({ wires })), script);
    expect(named(andPass.events, 'relayEmit')).toEqual([]);
    const orPass = playScript(createGame(relayRoom({ wires, logic: 'or' })), script);
    const emits = named(orPass.events, 'relayEmit');
    expect(emits.length).toBeGreaterThanOrEqual(1);
    expect(emits[0]!.tick).toBe(firstTick(orPass.events, 'plateDown', 'plate') + 1 + DELAY);
  });

  it('state changes every tick while a pulse is in flight, and pending stays strictly ascending integers', () => {
    const game = createGame(relayRoom());
    playScript(game, [S.moveTo(3, 1)]);
    let prev = JSON.stringify(entityOf(game.getState(), 'relay', 'chronoRelay').state);
    let inFlight = 0;
    for (let t = 0; t < DELAY * 2; t++) {
      playInputs(game, [{ ...IDLE_INPUT, moveX: t % 40 < 20 ? 1 : -1, tick: 0 }], 1); // wander on and off the plate
      const s = entityOf(game.getState(), 'relay', 'chronoRelay').state;
      const now = JSON.stringify(s);
      if (s.pending.length > 0) {
        inFlight++;
        expect(now).not.toBe(prev);
      }
      for (let i = 0; i < s.pending.length; i++) {
        expect(Number.isInteger(s.pending[i])).toBe(true);
        if (i > 0) expect(s.pending[i]!).toBeGreaterThan(s.pending[i - 1]!);
      }
      expect(s.pending.length).toBeLessThanOrEqual(DELAY);
      prev = now;
    }
    expect(inFlight).toBeGreaterThan(DELAY);
  });

  it('rewind clears the queue (state resets every pass)', () => {
    const game = createGame(relayRoom());
    playScript(game, [S.moveTo(3, 1), S.wait(10)]);
    expect(entityOf(game.getState(), 'relay', 'chronoRelay').state.pending.length).toBe(1);
    game.resetLoop();
    expect(entityOf(game.getState(), 'relay', 'chronoRelay').state).toEqual({ out: false, last: false, pending: [] });
    expect(game.getState().signals['relay']).toBe(false);
  });

  it('replays an echo press exactly: the echo-driven pulse lands at the same tick in every pass (deterministic)', () => {
    const level = relayRoom({ source: 'switch' });
    const game = createGame(level);
    const rec = playScript(game, [S.moveTo(4, 1), S.face(1), S.interact(), S.wait(10)]);
    const liveEmit = named(rec.events, 'relayArm')[0]?.tick ?? -2;
    expect(game.commitLoopAndRewind()).toBe(true);
    const pass = playInputs(game, [], 300);
    expect(named(pass.events, 'relayArm')[0]?.tick).toBe(liveEmit);
    const a = replayLoops(level, game.getLoops(), [], { totalTicks: 300 });
    const b = replayLoops(level, game.getLoops(), [], { totalTicks: 300 });
    expect(a.hashes).toEqual(b.hashes);
    expect(a.hashes).toEqual(pass.hashes);
  });

  it('is not solid, does not block lasers, cannot be carried or used', () => {
    const def = ent({ id: 'r', kind: 'chronoRelay', col: 0, row: 0, config: { delayTicks: 60 } });
    const e = { id: 'r', kind: 'chronoRelay' as const, x: 500, y: 0, z: 500, carriedBy: null, state: chronoRelayBehaviour.reset(def, { runtime: null as never }) };
    expect(chronoRelayBehaviour.isSolid?.(e, def)).toBe(false);
    expect(chronoRelayBehaviour.blocksLaser?.(e, def)).toBe(false);
    expect(chronoRelayBehaviour.carriable).toBeUndefined();
    expect(chronoRelayBehaviour.interact).toBeUndefined();
    expect(chronoRelayBehaviour.action).toBeUndefined();
  });

  it('a relay on a floor cell does not block walking (non-solid there)', () => {
    const level = relayRoom({ extra: [], wires: [{ from: 'plate', to: 'relay' }] });
    level.entities = level.entities.map((e) => (e.id === 'relay' ? { ...e, col: 2, row: 2 } : e));
    const game = createGame(level);
    const pass = playScript(game, [S.moveTo(2, 2), S.moveTo(2, 3)]);
    expect(pass.timedOut).toBe(false);
  });

  it('records inputs only: a pass that never touches the source leaves the relay idle', () => {
    const game = createGame(relayRoom());
    const pass = playInputs(game, inputs().wait(200).build());
    expect(named(pass.events, 'relayArm')).toEqual([]);
    expect(game.getState().signals['relay']).toBe(false);
  });
});
