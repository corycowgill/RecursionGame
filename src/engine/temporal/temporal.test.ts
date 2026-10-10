import { describe, expect, it } from 'vitest';
import type { PlayerInput, SimEvent, TemporalLoop } from '../contracts';
import { testChamber } from '../../levels/definitions/test-chamber';
import { crateRoom, openRoom } from '../../testing/harness/fixtures';
import {
  createGame,
  firstHashMismatch,
  playInputs,
  playScript,
  replayLoops,
  runSolution,
} from '../../testing/harness/harness';
import { inputs } from '../../testing/harness/script';
import { rngNext } from '../simulation/rng';
import { decodeLoop, encodeLoop } from './loops';

/** Seeded pseudo-random input sequence (test-side generator; deterministic). */
function randomInputs(seed: number, ticks: number): PlayerInput[] {
  let s = seed >>> 0;
  const out: PlayerInput[] = [];
  let mx: -1 | 0 | 1 = 0;
  let mz: -1 | 0 | 1 = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 15 === 0) {
      const r = rngNext(s);
      s = r.state;
      mx = ((r.value % 3) - 1) as -1 | 0 | 1;
      mz = (((r.value >>> 8) % 3) - 1) as -1 | 0 | 1;
    }
    out.push({ tick: t, moveX: mx, moveY: mz, interactPressed: false, interactHeld: false, actionPressed: false });
  }
  return out;
}

describe('determinism', () => {
  it('test chamber solution produces identical per-tick hash sequences across 3 runs', () => {
    const runs = [runSolution(testChamber), runSolution(testChamber), runSolution(testChamber)];
    for (const r of runs) expect(r.completed).toBe(true);
    const [a, b, c] = runs.map((r) => r.passes.map((p) => p.hashes));
    expect(a).toBeDefined();
    for (let pass = 0; pass < a!.length; pass++) {
      expect(a![pass]!.length).toBeGreaterThan(50);
      expect(firstHashMismatch(a![pass]!, b![pass]!)).toBe(-1);
      expect(firstHashMismatch(a![pass]!, c![pass]!)).toBe(-1);
    }
    expect(runs[0]!.completedAtTick).toBe(runs[1]!.completedAtTick);
  });

  it('re-simulating committed loops reproduces the live final pass exactly', () => {
    const live = runSolution(testChamber);
    const echoes = live.loops.slice(0, -1);
    const final = live.loops[live.loops.length - 1]!;
    const replay = replayLoops(testChamber, echoes, final.inputs);
    expect(replay.completed).toBe(true);
    expect(firstHashMismatch(live.passes[1]!.hashes, replay.hashes)).toBe(-1);
  });

  it('rewinding and re-playing the same inputs reproduces the same hashes in one game', () => {
    const game = createGame(testChamber);
    playScript(game, testChamber.solution[0]!);
    expect(game.commitLoopAndRewind()).toBe(true);
    const first = playScript(game, testChamber.solution[1]!);
    expect(first.completed).toBe(true);
    game.resetLoop();
    expect(game.getState().tick).toBe(0);
    const second = playInputs(game, first.inputs);
    expect(firstHashMismatch(first.hashes, second.hashes)).toBe(-1);
    expect(second.completed).toBe(true);
  });

  it('state contains only plain integer data', async () => {
    const { assertPlainIntegerData } = await import('../simulation/clone');
    const r = runSolution(testChamber);
    expect(() => assertPlainIntegerData(r.game.getState())).not.toThrow();
  });
});

describe('echoes', () => {
  it('3 echoes reproduce their recorded trajectories exactly and consistently', () => {
    const level = openRoom(3);
    const seqs = [randomInputs(11, 240), randomInputs(22, 300), randomInputs(33, 180)];
    const runOnce = (): { finalHashes: number[]; trajectories: [number, number][][]; game: ReturnType<typeof createGame> } => {
      const game = createGame(level);
      const trajectories: [number, number][][] = [];
      for (const seq of seqs) {
        const traj: [number, number][] = [];
        for (const input of seq) {
          game.step(input);
          const p = game.getState().actors[game.getState().actors.length - 1]!;
          traj.push([p.x, p.z]);
        }
        trajectories.push(traj);
        expect(game.commitLoopAndRewind()).toBe(true);
      }
      const final = playInputs(game, randomInputs(44, 360));
      return { finalHashes: final.hashes, trajectories, game };
    };
    const a = runOnce();
    const b = runOnce();
    const c = runOnce();
    expect(firstHashMismatch(a.finalHashes, b.finalHashes)).toBe(-1);
    expect(firstHashMismatch(a.finalHashes, c.finalHashes)).toBe(-1);

    // In an empty room nothing interferes, so each echo must retrace its recording exactly.
    const game = createGame(level);
    game.setLoops(a.game.getLoops());
    expect(game.getState().actors.map((x) => x.kind)).toEqual(['echo', 'echo', 'echo', 'player']);
    for (let t = 0; t < 300; t++) {
      game.step(inputs().wait(1).build()[0]!);
      const st = game.getState();
      for (let e = 0; e < 3; e++) {
        const traj = a.trajectories[e]!;
        const expected = traj[Math.min(t, traj.length - 1)]!;
        const actor = st.actors[e]!;
        expect([actor.x, actor.z]).toEqual(expected);
        expect(actor.finished).toBe(t >= traj.length);
      }
    }
  });

  it('echo ids and indices: echo:<loopId>, ordered by loop, player last', () => {
    const game = createGame(openRoom(3));
    playInputs(game, inputs().move(1, 0, 10).build());
    game.commitLoopAndRewind();
    playInputs(game, inputs().move(0, 1, 10).build());
    game.commitLoopAndRewind();
    const ids = game.getState().actors.map((a) => [a.id, a.echoIndex, a.loopId]);
    expect(ids).toEqual([
      ['echo:1', 0, 1],
      ['echo:2', 1, 2],
      ['player', -1, null],
    ]);
  });

  it('echo limit is enforced', () => {
    const game = createGame(openRoom(2));
    for (let i = 0; i < 2; i++) {
      playInputs(game, inputs().move(1, 0, 5).build());
      expect(game.commitLoopAndRewind()).toBe(true);
    }
    expect(game.echoesRemaining).toBe(0);
    game.drainEvents();
    playInputs(game, inputs().move(1, 0, 5).build());
    expect(game.commitLoopAndRewind()).toBe(false);
    expect(game.getLoops().length).toBe(2);
    expect(game.drainEvents().some((e) => e.type === 'echoLimitReached')).toBe(true);
    // The live recording is untouched by a refused commit.
    expect(game.getState().tick).toBe(5);
  });

  it('an empty recording cannot be committed', () => {
    const game = createGame(openRoom(2));
    expect(game.commitLoopAndRewind()).toBe(false);
    expect(game.getLoops().length).toBe(0);
  });
});

describe('divergence', () => {
  it('echo whose recorded pickup becomes impossible diverges, emits an event, and keeps replaying inputs', () => {
    const level = crateRoom(2);
    const game = createGame(level);
    // Loop 1: wait 60 ticks, walk to the crate, pick it up, carry it north-east.
    const loop1 = playScript(game, [
      { op: 'wait', ticks: 60 },
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'move', dx: 0, dz: -1, ticks: 10 },
      { op: 'wait', ticks: 20 },
    ]);
    expect(loop1.events.some((e) => e.type === 'pickup')).toBe(true);
    const recPlayer = game.getState().actors[0]!;
    const recordedEnd = { x: recPlayer.x, y: recPlayer.y, z: recPlayer.z };
    expect(game.commitLoopAndRewind()).toBe(true);
    const loop = game.getLoops()[0]!;
    expect(loop.outcomes.some((o) => o.kind === 'pickup' && o.entityId === 'crate-1')).toBe(true);

    // Loop 2 (player): rush to the crate first and take it away south.
    const pass = playScript(game, [
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'moveTo', col: 5, row: 4 },
      { op: 'waitUntil', tick: loop.durationTicks + 5 },
    ]);
    const div = pass.events.filter((e): e is Extract<SimEvent, { type: 'divergence' }> => e.type === 'divergence');
    expect(div.length).toBe(1);
    expect(div[0]!.actorId).toBe('echo:1');
    expect(div[0]!.expected.kind).toBe('pickup');
    expect(div[0]!.actual.kind).not.toBe('pickup');

    const st = game.getState();
    const echo = st.actors[0]!;
    expect(echo.carrying).toBeNull();
    expect(echo.divergedAtTick).toBe(div[0]!.tick);
    expect(st.entities['crate-1']!.carriedBy).toBe('player');

    // The echo was never teleported or forced: it kept replaying its inputs (walked north after the failed
    // pickup) and ends exactly where its recording ended, just without the crate.
    expect({ x: echo.x, y: echo.y, z: echo.z }).toEqual(recordedEnd);
    expect(echo.finished).toBe(true);
    const track = game.getTimeline().tracks.find((t) => t.actorId === 'echo:1')!;
    expect(track.divergences.length).toBe(1);
    expect(track.planned.some((m) => m.kind === 'pickup')).toBe(true);
    expect(track.actual.some((m) => m.kind === 'pickup')).toBe(false);
  });

  it('simultaneous contest: the earlier actor in processing order (echo) wins the crate', () => {
    const level = crateRoom(2);
    const game = createGame(level);
    const script = [{ op: 'moveTo', col: 5, row: 2 } as const, { op: 'face', dir: 1 } as const, { op: 'interact' } as const];
    playScript(game, [...script, { op: 'wait', ticks: 5 }]);
    game.commitLoopAndRewind();
    const pass = playScript(game, [...script, { op: 'wait', ticks: 5 }]);
    expect(game.getState().entities['crate-1']!.carriedBy).toBe('echo:1');
    expect(pass.events.some((e) => e.type === 'divergence')).toBe(false);
    const playerTrack = game.getTimeline().tracks.find((t) => t.actorId === 'player')!;
    expect(playerTrack.actual.some((m) => m.kind === 'pickup')).toBe(false);
  });
});

describe('snapshots & scrubbing', () => {
  it('getSnapshotAt(t) equals the live state at t (re-simulation from cached snapshots)', () => {
    const game = createGame(testChamber, { snapshotInterval: 30 });
    playScript(game, testChamber.solution[0]!);
    game.commitLoopAndRewind();
    const pass = playScript(game, testChamber.solution[1]!);
    expect(pass.completed).toBe(true);
    const ticks = [0, 1, 29, 30, 31, 59, 60, 97, 150, pass.hashes.length - 1, pass.hashes.length];
    for (const t of ticks) {
      const snap = game.getSnapshotAt(t);
      expect(snap.tick).toBe(t);
      if (t > 0) expect(game.hashOf(snap)).toBe(pass.hashes[t - 1]);
    }
    // Scrubbing does not disturb the live state.
    expect(game.hash()).toBe(pass.hashes[pass.hashes.length - 1]);
  });

  it('snapshot interval does not affect results', () => {
    const a = createGame(testChamber, { snapshotInterval: 1 });
    const b = createGame(testChamber, { snapshotInterval: 97 });
    for (const g of [a, b]) {
      playScript(g, testChamber.solution[0]!);
      g.commitLoopAndRewind();
      playInputs(g, inputs().move(1, 1, 40).wait(100).build());
    }
    for (const t of [3, 50, 97, 120]) expect(a.hashOf(a.getSnapshotAt(t))).toBe(b.hashOf(b.getSnapshotAt(t)));
  });

  it('preview beyond the current tick matches stepping with an idle player', () => {
    const game = createGame(testChamber);
    playScript(game, testChamber.solution[0]!);
    game.commitLoopAndRewind();
    playInputs(game, inputs().move(1, 0, 20).build());
    const preview = game.getSnapshotAt(200);
    const preview2 = game.getSnapshotAt(150);
    expect(game.getState().tick).toBe(20);

    const ref = createGame(testChamber);
    ref.setLoops(game.getLoops());
    playInputs(ref, [...inputs().move(1, 0, 20).build()], 200);
    expect(game.hashOf(preview)).toBe(ref.hash());
    const ref2 = createGame(testChamber);
    ref2.setLoops(game.getLoops());
    playInputs(ref2, [...inputs().move(1, 0, 20).build()], 150);
    expect(game.hashOf(preview2)).toBe(ref2.hash());
  });

  it('loop deletion invalidates snapshots and re-simulates with the remaining echoes', () => {
    const level = openRoom(3);
    const game = createGame(level);
    playInputs(game, inputs().move(1, 0, 40).build());
    game.commitLoopAndRewind();
    playInputs(game, inputs().move(0, 1, 40).build());
    game.commitLoopAndRewind();
    playInputs(game, inputs().move(-1, 0, 60).build());
    const before = game.getSnapshotAt(30);
    expect(before.actors.length).toBe(3);

    const keep: TemporalLoop = game.getLoops()[1]!;
    game.deleteLoop(0);
    expect(game.getState().tick).toBe(0);
    expect(game.getLoops().map((l) => l.id)).toEqual([2]);
    const st = game.getState();
    expect(st.actors.map((a) => [a.id, a.echoIndex])).toEqual([
      ['echo:2', 0],
      ['player', -1],
    ]);
    const after = playInputs(game, inputs().move(-1, 0, 60).build());
    expect(game.getSnapshotAt(30).actors.length).toBe(2);

    const fresh = createGame(level);
    fresh.setLoops([keep]);
    const ref = playInputs(fresh, inputs().move(-1, 0, 60).build());
    expect(firstHashMismatch(after.hashes, ref.hashes)).toBe(-1);
  });

  it('restartChamber clears all loops', () => {
    const game = createGame(openRoom(3));
    playInputs(game, inputs().move(1, 0, 10).build());
    game.commitLoopAndRewind();
    game.restartChamber();
    expect(game.getLoops().length).toBe(0);
    expect(game.getState().actors.length).toBe(1);
    expect(game.getState().tick).toBe(0);
  });
});

describe('loop timing & persistence', () => {
  it('recording stops at loopDurationTicks with loopTimeUp', () => {
    const level = { ...openRoom(1), loopDurationTicks: 50 };
    const game = createGame(level);
    const res = playInputs(game, inputs().move(1, 0, 80).build());
    expect(res.inputs.length).toBe(50);
    expect(game.getState().status).toBe('timeUp');
    expect(res.events.some((e) => e.type === 'loopTimeUp')).toBe(true);
    expect(game.step(inputs().wait(1).build()[0]!).advanced).toBe(false);
    expect(game.commitLoopAndRewind()).toBe(true);
    expect(game.getLoops()[0]!.durationTicks).toBe(50);
  });

  it('encodeLoop/decodeLoop round-trips and reproduces identical replays', () => {
    const live = runSolution(testChamber);
    const echo = live.loops[0]!;
    const enc = encodeLoop(echo);
    expect(enc.runs.length).toBeLessThan(echo.inputs.length);
    const dec = decodeLoop(JSON.parse(JSON.stringify(enc)));
    expect(dec.inputs).toEqual(echo.inputs);
    const final = live.loops[1]!;
    const replay = replayLoops(testChamber, [dec], final.inputs);
    expect(firstHashMismatch(live.passes[1]!.hashes, replay.hashes)).toBe(-1);
  });

  it('events: rewind + echoSpawned are emitted on commit', () => {
    const game = createGame(testChamber);
    game.drainEvents();
    playScript(game, testChamber.solution[0]!);
    game.drainEvents();
    game.commitLoopAndRewind();
    const types = game.drainEvents().map((e) => e.type);
    expect(types).toEqual(['rewind', 'echoSpawned', 'recordStart']);
  });
});
