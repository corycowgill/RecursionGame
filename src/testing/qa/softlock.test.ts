import { describe, expect, it } from 'vitest';
import type { LevelDefinition, PlayerInput, SimEvent } from '../../engine/contracts';
import { rngNext, seedRng } from '../../engine/simulation/rng';
import { LEVELS, TEST_LEVELS } from '../../levels';
import { crateRoom } from '../harness/fixtures';
import { createGame, firstHashMismatch, playInputs, playScript, runSolution } from '../harness/harness';
import { S } from '../harness/script';
import { componentGauntlet } from './fixtures';
import { InvariantChecker } from './invariants';

/**
 * SOFT-LOCK DETECTION. A temporal puzzle can always be rewound, so a soft-lock here means one of:
 *   - a reset path that does not restore the deterministic start (restart / reset loop / delete echo leak state),
 *   - a pass that never ends or stops advancing while 'playing' (the player could not leave the chamber),
 *   - the echo limit wedging the loop (no way to start a new take),
 *   - a paradox (failed echo interaction) stalling the pass instead of letting it continue,
 *   - history leaking into later passes so a known solution stops working after the player experimented,
 *   - an item that can never be picked up again (checked per tick by the fuzzer's 'softlock' invariant; here at
 *     tick 0 of every level).
 */

const all: LevelDefinition[] = [...LEVELS, ...TEST_LEVELS, componentGauntlet()];

function noise(seed: number, ticks: number): PlayerInput[] {
  let s = seedRng(seed);
  const out: PlayerInput[] = [];
  let mx: -1 | 0 | 1 = 0;
  let mz: -1 | 0 | 1 = 0;
  for (let t = 0; t < ticks; t++) {
    const r = rngNext(s);
    s = r.state;
    if (t % 20 === 0) {
      mx = ((r.value % 3) - 1) as -1 | 0 | 1;
      mz = (((r.value >>> 4) % 3) - 1) as -1 | 0 | 1;
    }
    const press = (r.value >>> 12) % 25 === 0;
    out.push({ tick: t, moveX: mx, moveY: mz, interactPressed: press, interactHeld: press, actionPressed: (r.value >>> 20) % 61 === 0 });
  }
  return out;
}

const freshHash = (level: LevelDefinition, loops: Parameters<ReturnType<typeof createGame>['setLoops']>[0] = []): number => {
  const g = createGame(level);
  if (loops.length) g.setLoops(loops);
  return g.hash();
};

describe.each(all.map((l) => [l.id, l] as const))('soft-lock: %s', (_id, level) => {
  it('reset paths restore the exact deterministic start (restart, reset loop, delete echo, setLoops)', () => {
    const h0 = freshHash(level);
    const game = createGame(level);
    expect(game.hash()).toBe(h0);
    const n = Math.min(level.maxEchoes, 3);
    for (let i = 0; i < n; i++) {
      playInputs(game, noise(10 + i, 240), undefined, { recordHashes: false });
      expect(game.commitLoopAndRewind()).toBe(true);
      expect(game.getState().tick).toBe(0);
      expect(game.hash()).toBe(freshHash(level, game.getLoops()));
    }
    playInputs(game, noise(99, 300), undefined, { recordHashes: false });
    game.resetLoop();
    expect(game.hash()).toBe(freshHash(level, game.getLoops()));
    if (n > 0) {
      playInputs(game, noise(98, 200), undefined, { recordHashes: false });
      game.deleteLoop(0);
      expect(game.getLoops().length).toBe(n - 1);
      expect(game.hash()).toBe(freshHash(level, game.getLoops()));
    }
    playInputs(game, noise(97, 200), undefined, { recordHashes: false });
    game.restartChamber();
    expect(game.getLoops().length).toBe(0);
    expect(game.hash()).toBe(h0);
  });

  it('every pass ends: it advances every tick until timeUp exactly at loopDurationTicks, then a new take can start', () => {
    const game = createGame(level);
    const pass = playInputs(game, [], level.loopDurationTicks + 10, { recordHashes: false });
    expect(pass.inputs.length).toBe(level.loopDurationTicks); // never stalled while playing
    expect(game.getState().status).toBe('timeUp');
    expect(game.step({ tick: game.getState().tick, moveX: 1, moveY: 0, interactPressed: false, interactHeld: false, actionPressed: false }).advanced).toBe(false);
    if (level.maxEchoes > 0) {
      expect(game.commitLoopAndRewind()).toBe(true); // the timed-out take becomes an echo...
      expect(game.getState().status).toBe('playing');
    }
    game.resetLoop(); // ...or the loop restarts
    expect(game.getState()).toMatchObject({ status: 'playing', tick: 0 });
  });

  it('the echo limit never wedges the loop: commit is refused, reset still works, deleting frees a slot', () => {
    const game = createGame(level);
    for (let i = 0; i < level.maxEchoes; i++) {
      playInputs(game, noise(i, 30), undefined, { recordHashes: false });
      expect(game.commitLoopAndRewind()).toBe(true);
    }
    expect(game.echoesRemaining).toBe(0);
    playInputs(game, noise(77, 30), undefined, { recordHashes: false });
    game.drainEvents();
    expect(game.commitLoopAndRewind()).toBe(false);
    expect(game.drainEvents().map((e) => e.type)).toContain('echoLimitReached');
    expect(game.getState().tick).toBe(30); // refused commit leaves the take running
    game.resetLoop();
    expect(game.getState()).toMatchObject({ status: 'playing', tick: 0 });
    if (level.maxEchoes > 0) {
      game.deleteLoop(level.maxEchoes - 1);
      playInputs(game, noise(78, 30), undefined, { recordHashes: false });
      expect(game.commitLoopAndRewind()).toBe(true);
    }
  });

  it('no carriable item starts in an unrecoverable spot and the start state satisfies every invariant', () => {
    const game = createGame(level);
    const v = new InvariantChecker(level).check(game.getState(), game.getLoops());
    expect(v).toEqual([]);
  });
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('soft-lock: %s known solution survives arbitrary history', (_id, level) => {
  it('after experimenting (commits, deletes, resets), restart + the known solution completes with clean-run hashes', () => {
    const clean = runSolution(level);
    expect(clean.completed).toBe(true);
    const game = createGame(level);
    for (let i = 0; i < 6; i++) {
      playInputs(game, noise(500 + i, 150 + i * 40), undefined, { recordHashes: false });
      if (i % 3 === 2 && game.getLoops().length > 0) game.deleteLoop(0);
      else if (!game.commitLoopAndRewind()) game.resetLoop();
    }
    game.restartChamber();
    const passes = level.solution.map((script, i) => {
      const p = playScript(game, script);
      if (i < level.solution.length - 1) expect(game.commitLoopAndRewind()).toBe(true);
      return p;
    });
    const last = passes[passes.length - 1]!;
    expect(last.completed).toBe(true);
    expect(last.completedAtTick).toBe(clean.completedAtTick);
    // Loop ids are never reused (echo:<id> is part of the hash), so compare against a fresh chamber holding the
    // very same loops: any state leaking from the experiments would show up as a hash mismatch.
    const fresh = createGame(level);
    fresh.setLoops(game.getLoops());
    const replay = playInputs(fresh, last.inputs);
    expect(firstHashMismatch(last.hashes, replay.hashes)).toBe(-1);
    // And every actor follows exactly the clean run's trajectory.
    const a = game.getState().actors.map((x) => [x.x, x.y, x.z, x.carrying]);
    const b = clean.game.getState().actors.map((x) => [x.x, x.y, x.z, x.carrying]);
    expect(a).toEqual(b);
  });
});

describe('soft-lock: paradoxes never stall a pass', () => {
  it("an echo whose recorded pickup fails (the player took the crate first) diverges, keeps replaying, and the player can still finish", () => {
    const level = crateRoom(2);
    const game = createGame(level);
    // Loop 1: dawdle, then walk to the crate and pick it up (tick ~100).
    playScript(game, [S.wait(60), S.moveTo(5, 2), S.face(1), S.interact(), S.moveTo(5, 3), S.wait(30)]);
    expect(game.getRecording().some((i) => i.interactPressed)).toBe(true);
    expect(game.commitLoopAndRewind()).toBe(true);
    // Pass 2: the player rushes the crate first, so the echo's recorded pickup cannot happen.
    const events: SimEvent[] = [];
    const rush = playScript(game, [S.moveTo(5, 2), S.face(1), S.interact(), S.moveTo(8, 3), S.face(2), S.interact(), S.moveTo(4, 4), S.moveTo(4, 6)]);
    events.push(...rush.events);
    const div = events.filter((e) => e.type === 'divergence');
    expect(div.length).toBeGreaterThan(0);
    expect(rush.completed).toBe(true); // the paradox did not block the player
    const track = game.getTimeline().tracks[0]!;
    expect(track.divergences.length).toBeGreaterThan(0);
    // The echo kept replaying its inputs (it moved after diverging; never teleported).
    const echo = game.getState().actors[0]!;
    expect(echo.divergedAtTick).not.toBeNull();
    expect(echo.divergenceCount).toBeGreaterThan(0);
    // After the failed pickup its recording walks south to row 3, and it did.
    expect(echo.z).toBeGreaterThan(3000);
    expect(echo.carrying).toBeNull();
  });
});
