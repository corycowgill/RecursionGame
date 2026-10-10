import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../../engine/contracts';
import { createGame } from '../harness/harness';
import { terrainRoom } from '../harness/fixtures';
import { inputs, type InputSequenceBuilder } from '../harness/script';
import { InvariantChecker, summarizeViolations, type Violation } from './invariants';

/**
 * Minimal deterministic reproductions of bugs found by the QA fuzzer (src/testing/qa/fuzz.ts).
 *  - "fixed" cases are regression tests.
 *  - "open" cases are `it.fails`: they assert the CORRECT behaviour and currently fail because the bug exists.
 *    When the owner fixes the bug, Vitest reports the `it.fails` as an unexpected pass: flip it to `it`, and drop
 *    the matching entry from knownIssue() in fuzz.test.ts.
 *  - QA-1/2/3 were fixed in round 2 (rules in docs/architecture/contracts.md §5/§6); each now has edge-variant
 *    regression tests. There are no open cases.
 */

function room(id: string, tiles: string[], entities: LevelDefinition['entities'], extra: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id,
    order: 0,
    name: id,
    grid: { width: (tiles[0] ?? '').length, height: tiles.length, tiles, ...(extra.grid?.heights ? { heights: extra.grid.heights } : {}) },
    entities: [...entities, { id: 'exit', kind: 'exitPortal', col: 1, row: tiles.length - 2, config: {} }],
    wires: extra.wires ?? [],
    playerSpawn: extra.playerSpawn ?? { col: 1, row: 1, facing: 1 },
    exitId: 'exit',
    maxEchoes: 2,
    loopDurationTicks: 1200,
    parTimeSeconds: 30,
    hints: [],
    solution: [[{ op: 'wait', ticks: 1 }]],
  };
}

/** Plays open-loop inputs and returns every invariant violation seen after each tick. */
function violations(level: LevelDefinition, seq: InputSequenceBuilder): Violation[] {
  const checker = new InvariantChecker(level);
  const game = createGame(level);
  const out: Violation[] = [];
  for (const input of seq.build()) {
    game.step(input);
    out.push(...checker.check(game.getState(), game.getLoops()));
  }
  return out;
}

describe('fixed: QA-0 actors slid into / stepped off the side of a ramp (engine collision)', () => {
  // Walking east along row 3 with the footprint overlapping the ramp (4,2) that rises eastward: the
  // "already-overlapping cells never block" rule let the body slide up to 0.72 levels deep into the ramp side.
  it('walking along a rising ramp side stops at the step tolerance instead of clipping into it', () => {
    const level = terrainRoom();
    const seq = inputs().move(0, 1, 15).move(1, 0, 60).wait(5);
    const v = violations(level, seq);
    expect(v, summarizeViolations(v)).toEqual([]);
    const game = createGame(level);
    for (const i of seq.build()) game.step(i);
    const p = game.getState().actors[0]!;
    expect(p.z).toBeLessThan(3280); // the footprint really overlaps the ramp row
    expect(p.x).toBeLessThan(4400); // stopped where the ramp side rises past STEP_TOLERANCE
  });

  it('cannot step off the side of a ramp onto the floor far below (no ledge drops through the side)', () => {
    const level = terrainRoom();
    // Hug the south edge of the ramp row so the footprint already overlaps the lower row 3, climb the ramp, then
    // turn south: the centre must not cross into row 3 (a 0.7-level drop) and the body must not end inside the ramp.
    const climb = inputs().move(0, 1, 7).move(1, 0, 55);
    const game = createGame(level);
    for (const i of climb.build()) game.step(i);
    const onRamp = game.getState().actors[0]!;
    expect(onRamp.y).toBeGreaterThan(500);
    expect(onRamp.z + 280).toBeGreaterThan(3000); // footprint overlaps row 3
    const v = violations(level, inputs().move(0, 1, 7).move(1, 0, 55).move(0, 1, 20).wait(5));
    expect(v, summarizeViolations(v)).toEqual([]);
    for (const i of inputs().move(0, 1, 20).build()) game.step(i);
    const after = game.getState().actors[0]!;
    expect(Math.floor(after.z / 1000)).toBe(2); // the centre stayed on the ramp row
    expect(after.y).toBe(onRamp.y);
  });

  it('can still walk up the ramp from its low edge and back down', () => {
    const level = terrainRoom();
    const game = createGame(level);
    for (const i of inputs().move(1, 0, 80).wait(5).build()) game.step(i);
    expect(game.getState().actors[0]!.y).toBe(1000);
    for (const i of inputs().move(-1, 0, 80).build()) game.step(i);
    expect(game.getState().actors[0]!.y).toBe(0);
  });
});

/** Plays `seq` on `game` (continuing from its current tick), collecting invariant violations and events. */
function play(game: ReturnType<typeof createGame>, checker: InvariantChecker, seq: InputSequenceBuilder): { v: Violation[]; events: string[] } {
  const v: Violation[] = [];
  const events: string[] = [];
  for (const input of seq.build()) {
    const r = game.step(input);
    for (const e of r.events) events.push(e.type);
    v.push(...checker.check(game.getState(), game.getLoops()));
  }
  return { v, events };
}

const playerOf = (game: ReturnType<typeof createGame>) => {
  const st = game.getState();
  return st.actors[st.actors.length - 1]!;
};

// Rule (contracts §5 "Moving platforms" / §6 step 4b): a deck's walk surface is exactly its real 1x1 extent (clipped
// per straddled cell); riders are carried in the same tick the deck moves; nobody can walk onto, or be left on, the
// half of a straddled cell the deck has already left.
describe('fixed: QA-1 rider left floating over the pit next to a moving deck (gameplay movingPlatform + engine)', () => {
  const deckRoom = (path = [{ col: 2, row: 1 }, { col: 5, row: 1 }]) =>
    room('qa1', ['#########', '#.____..#', '#.......#', '#########'], [
      { id: 'deck', kind: 'movingPlatform', col: 2, row: 1, level: 0, config: { path, speed: 20, pauseTicks: 60 } },
    ]);
  const deckOf = (game: ReturnType<typeof createGame>) => game.getState().entities['deck']!;

  it('QA-1: riding a moving deck never leaves an actor floating over the void', () => {
    const level = deckRoom();
    const v = violations(level, inputs().wait(60).move(1, 0, 18).wait(60));
    expect(v.filter((x) => x.rule === 'platform' || x.rule === 'wall'), summarizeViolations(v)).toEqual([]);
  });

  it('cannot step across the pit edge onto a deck that has already pulled away (stops flush at the edge)', () => {
    const level = deckRoom();
    const game = createGame(level);
    const { v } = play(game, new InvariantChecker(level), inputs().wait(61).move(1, 0, 40));
    expect(v, summarizeViolations(v)).toEqual([]);
    expect(playerOf(game).x).toBe(2000 - 280);
    expect(playerOf(game).y).toBe(0);
  });

  it('a rider standing on the trailing edge is carried the whole way, in the same tick as the deck', () => {
    const level = deckRoom();
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    // Board while docked and stop with the centre 20 units inside the trailing (west) edge.
    let r = play(game, checker, inputs().move(1, 0, 13).wait(47));
    expect(playerOf(game).x).toBe(2020);
    for (let t = 0; t < 200; t++) {
      const before = { p: playerOf(game).x, d: deckOf(game).x };
      r = play(game, checker, inputs().wait(1));
      expect(r.v, summarizeViolations(r.v)).toEqual([]);
      // No lag: the rider moves exactly as far as the deck in every tick.
      expect(playerOf(game).x - before.p).toBe(deckOf(game).x - before.d);
    }
    expect(deckOf(game).x).toBe(5500);
    expect(playerOf(game).x).toBe(5020);
  });

  it('a rider walking toward the trailing edge of a moving deck stops at its real edge (no walking onto the pit half)', () => {
    const level = deckRoom();
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const a = play(game, checker, inputs().move(1, 0, 25).wait(50)); // centre of the deck, deck departs at t=60
    expect(a.v, summarizeViolations(a.v)).toEqual([]);
    const b = play(game, checker, inputs().move(-1, 0, 40));
    expect(b.v, summarizeViolations(b.v)).toEqual([]);
    const d = deckOf(game);
    expect(d.x).toBeGreaterThan(2500);
    expect(d.x).toBeLessThan(5500);
    expect(playerOf(game).x).toBe(d.x - 500);
    expect(playerOf(game).y).toBe(0);
  });

  it('works the same along z (deck travelling south)', () => {
    const level = room('qa1z', ['#####', '#...#', '#._.#', '#._.#', '#._.#', '#...#', '#####'], [
      { id: 'deck', kind: 'movingPlatform', col: 2, row: 2, level: 0, config: { path: [{ col: 2, row: 2 }, { col: 2, row: 4 }], speed: 20, pauseTicks: 60 } },
    ], { playerSpawn: { col: 2, row: 1, facing: 2 } });
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const r = play(game, checker, inputs().move(0, 1, 13).wait(200));
    expect(r.v, summarizeViolations(r.v)).toEqual([]);
    expect(deckOf(game).z).toBe(4500);
    expect(playerOf(game).z).toBe(4020);
    // Late arrival: the deck already left, so walking south from the floor stops at the pit edge.
    const late = createGame(level);
    const r2 = play(late, new InvariantChecker(level), inputs().wait(70).move(0, 1, 40));
    expect(r2.v, summarizeViolations(r2.v)).toEqual([]);
    expect(playerOf(late).z).toBe(2000 - 280);
  });

  it('an item cannot be dropped onto the half of a straddled cell the deck has left', () => {
    const level = room('qa1drop', ['#########', '#.____..#', '#.......#', '#########'], [
      { id: 'crate', kind: 'crate', col: 1, row: 2, config: {} },
      { id: 'deck', kind: 'movingPlatform', col: 2, row: 1, level: 0, config: { path: [{ col: 2, row: 1 }, { col: 5, row: 1 }], speed: 20, pauseTicks: 60 } },
    ], { playerSpawn: { col: 1, row: 1, facing: 2 } });
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    // Pick the crate up (facing south), face east toward the deck cell, wait until the deck centre is past x=3000.
    const r = play(game, checker, inputs().interact().wait(2).move(1, 0, 1).wait(100).interact().wait(2));
    expect(r.v, summarizeViolations(r.v)).toEqual([]);
    expect(r.events).toContain('pickup');
    expect(r.events).toContain('interactFailed');
    expect(r.events).not.toContain('drop');
    expect(game.getState().entities['crate']!.carriedBy).toBe('player');
  });
});

// Rule (contracts §5 "Temporal gates"): a gate that should close while any actor's footprint overlaps its cell stays
// open (output stays true, no gateClose) and closes on the first tick the cell is clear.
describe('fixed: QA-2 temporal gate closed on an actor standing in it (gameplay temporalGate)', () => {
  const gateRoom = () =>
    room(
      'qa2',
      ['########', '#......#', '#......#', '########'],
      [
        { id: 'sw', kind: 'timedSwitch', col: 1, row: 1, config: { durationTicks: 60 } },
        { id: 'gate', kind: 'temporalGate', col: 4, row: 1, config: { allows: 'all', requiresSignal: true } },
      ],
      { wires: [{ from: 'sw', to: 'gate' }], playerSpawn: { col: 2, row: 1, facing: 3 } },
    );
  const gateOf = (game: ReturnType<typeof createGame>) => game.getState().entities['gate'] as { state: { open: boolean } };

  it('QA-2: a temporal gate never closes on an actor standing in it', () => {
    const level = gateRoom();
    const v = violations(level, inputs().interact().wait(3).move(1, 0, 50).wait(100));
    expect(v.filter((x) => x.rule === 'solid'), summarizeViolations(v)).toEqual([]);
  });

  it('stays open while occupied, closes as soon as the occupant leaves, then blocks again', () => {
    const level = gateRoom();
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const a = play(game, checker, inputs().interact().wait(3).move(1, 0, 50).wait(100));
    expect(a.v, summarizeViolations(a.v)).toEqual([]);
    expect(a.events).toContain('switchOff');
    expect(a.events).not.toContain('gateClose');
    expect(gateOf(game).state.open).toBe(true);
    const b = play(game, checker, inputs().move(-1, 0, 30).wait(3));
    expect(b.v, summarizeViolations(b.v)).toEqual([]);
    expect(b.events).toContain('gateClose');
    expect(gateOf(game).state.open).toBe(false);
    play(game, checker, inputs().move(1, 0, 60));
    expect(playerOf(game).x).toBe(4000 - 280);
  });

  it('a footprint merely straddling the gate edge also holds it open', () => {
    const level = gateRoom();
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const a = play(game, checker, inputs().interact().wait(3).move(1, 0, 33).wait(100));
    expect(a.v, summarizeViolations(a.v)).toEqual([]);
    expect(playerOf(game).x).toBe(3820); // centre outside, footprint 80 units into the gate cell
    expect(gateOf(game).state.open).toBe(true);
    const b = play(game, checker, inputs().move(-1, 0, 3).wait(2));
    expect(b.events).toContain('gateClose');
  });

  it('an echo standing in the gate holds it open on replay', () => {
    const level = gateRoom();
    const game = createGame(level);
    play(game, new InvariantChecker(level), inputs().interact().wait(3).move(1, 0, 50).wait(20));
    expect(game.commitLoopAndRewind()).toBe(true);
    const checker = new InvariantChecker(level);
    const r = play(game, checker, inputs().wait(200));
    expect(r.v, summarizeViolations(r.v)).toEqual([]);
    expect(r.events).not.toContain('gateClose');
  });
});

// Rule (contracts §5 "Elevators"): a lift never moves into a body. Departure is held while someone straddles the
// shaft edge; during travel the platform rises at most STEP_TOLERANCE above a straddler's feet and sinks a rider at
// most STEP_TOLERANCE below a neighbouring surface its footprint overhangs, waiting there until the actor clears.
describe('fixed: QA-3 brief clip into a departing lift (gameplay elevator)', () => {
  const liftRoom = (config: object) =>
    room('qa3', ['#######', '#.._..#', '#.....#', '#######'], [
      { id: 'lift', kind: 'elevator', col: 3, row: 1, level: 0, config: { levels: [0, 1], ...config } },
    ], { grid: { width: 7, height: 4, tiles: [], heights: ['0000000', '0000110', '0000000', '0000000'] } });
  const liftOf = (game: ReturnType<typeof createGame>) => game.getState().entities['lift'] as { state: { y: number; held: boolean } };

  it('QA-3: a rising lift never rises into the body of an actor stepping off it', () => {
    const level = liftRoom({ mode: 'ride', rideDelayTicks: 20 });
    const v = violations(level, inputs().move(1, 0, 50).wait(8).move(-1, 0, 25).wait(10));
    expect(v.filter((x) => x.rule === 'ledge'), summarizeViolations(v)).toEqual([]);
  });

  it('waits at feet + STEP_TOLERANCE while the actor straddles, then resumes and arrives once clear', () => {
    const level = liftRoom({ mode: 'ride', rideDelayTicks: 20 });
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const a = play(game, checker, inputs().move(1, 0, 50).wait(8).move(-1, 0, 14).wait(30));
    expect(a.v, summarizeViolations(a.v)).toEqual([]);
    expect(playerOf(game).y).toBe(0);
    expect(liftOf(game).state.y).toBe(300);
    expect(liftOf(game).state.held).toBe(true);
    const b = play(game, checker, inputs().move(-1, 0, 25).wait(80));
    expect(b.v, summarizeViolations(b.v)).toEqual([]);
    expect(b.events).toContain('elevatorArrive');
    expect(liftOf(game).state.y).toBe(1000);
  });

  it('boarding back onto the waiting lift lets it carry on with the rider', () => {
    const level = liftRoom({ mode: 'ride', rideDelayTicks: 20 });
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const r = play(game, checker, inputs().move(1, 0, 50).wait(8).move(-1, 0, 14).wait(30).move(1, 0, 10).wait(80));
    expect(r.v, summarizeViolations(r.v)).toEqual([]);
    expect(liftOf(game).state.y).toBe(1000);
    expect(playerOf(game).y).toBe(1000);
  });

  it('a descending lift never sinks a rider into the upper floor its footprint overhangs', () => {
    // Lift parked at the top (level 1) beside the upper floor (cells 4-5). The rider stands on the lift with its
    // footprint still over cell 4 and sends it down (cycle mode, E on the platform).
    const level = room('qa3down', ['#######', '#.._..#', '#.....#', '#######'], [
      { id: 'lift', kind: 'elevator', col: 3, row: 1, level: 0, config: { levels: [0, 1], mode: 'cycle', startIndex: 1 } },
    ], { grid: { width: 7, height: 4, tiles: [], heights: ['0000000', '0000110', '0000000', '0000000'] }, playerSpawn: { col: 4, row: 1, facing: 3 } });
    const game = createGame(level);
    const checker = new InvariantChecker(level);
    const a = play(game, checker, inputs().move(-1, 0, 18).interact().wait(60));
    expect(a.v, summarizeViolations(a.v)).toEqual([]);
    expect(playerOf(game).x).toBe(3780);
    expect(liftOf(game).state.y).toBe(700);
    expect(playerOf(game).y).toBe(700);
    const b = play(game, checker, inputs().move(-1, 0, 3).wait(80));
    expect(b.v, summarizeViolations(b.v)).toEqual([]);
    expect(liftOf(game).state.y).toBe(0);
    expect(playerOf(game).y).toBe(0);
  });
});
