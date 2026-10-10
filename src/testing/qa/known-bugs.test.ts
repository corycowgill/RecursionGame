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

describe('open bugs (it.fails until fixed)', () => {
  // QA-1 (gameplay movingPlatform + engine surfaces): the deck reports whole cells as walkable while straddling
  // two cells; a rider standing on the straddled half outside the deck's real extent is left over the void when the
  // deck moves on, and can then walk around on air inside the void cell (y stays, settleOnSurface is a no-op).
  it.fails('QA-1: riding a moving deck never leaves an actor floating over the void', () => {
    const level = room('qa1', ['#########', '#.____..#', '#.......#', '#########'], [
      { id: 'deck', kind: 'movingPlatform', col: 2, row: 1, level: 0, config: { path: [{ col: 2, row: 1 }, { col: 5, row: 1 }], speed: 20, pauseTicks: 60 } },
    ]);
    const v = violations(level, inputs().wait(60).move(1, 0, 18).wait(60));
    expect(v.filter((x) => x.rule === 'platform' || x.rule === 'wall'), summarizeViolations(v)).toEqual([]);
  });

  // QA-2 (gameplay temporalGate): a signal-gated temporal gate closes while an actor stands in it, leaving the
  // actor inside a solid (doors refuse to close on occupants and emit doorBlocked; gates do not).
  it.fails('QA-2: a temporal gate never closes on an actor standing in it', () => {
    const level = room(
      'qa2',
      ['########', '#......#', '#......#', '########'],
      [
        { id: 'sw', kind: 'timedSwitch', col: 1, row: 1, config: { durationTicks: 60 } },
        { id: 'gate', kind: 'temporalGate', col: 4, row: 1, config: { allows: 'all', requiresSignal: true } },
      ],
      { wires: [{ from: 'sw', to: 'gate' }], playerSpawn: { col: 2, row: 1, facing: 3 } },
    );
    const v = violations(level, inputs().interact().wait(3).move(1, 0, 50).wait(100));
    expect(v.filter((x) => x.rule === 'solid'), summarizeViolations(v)).toEqual([]);
  });

  // QA-3 (gameplay elevator): stepping off a lift just after it departs is allowed (the drop is still within the
  // step tolerance) but the lift keeps rising while the actor's footprint still overlaps the shaft, so the body
  // clips into the platform edge for several ticks.
  it.fails('QA-3: a rising lift never rises into the body of an actor stepping off it', () => {
    const level = room('qa3', ['#######', '#.._..#', '#.....#', '#######'], [
      { id: 'lift', kind: 'elevator', col: 3, row: 1, level: 0, config: { levels: [0, 1], mode: 'ride', rideDelayTicks: 20 } },
    ], { grid: { width: 7, height: 4, tiles: [], heights: ['0000000', '0000110', '0000000', '0000000'] } });
    const v = violations(level, inputs().move(1, 0, 50).wait(8).move(-1, 0, 25).wait(10));
    expect(v.filter((x) => x.rule === 'ledge'), summarizeViolations(v)).toEqual([]);
  });
});
