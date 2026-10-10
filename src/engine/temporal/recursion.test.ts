import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../contracts';
import { createGame, firstHashMismatch, playScript, replayLoops, runScripts } from '../../testing/harness/harness';
import { crateRoom, openRoom } from '../../testing/harness/fixtures';
import { S } from '../../testing/harness/script';
import { replayTracks, trackInputAt } from '../simulation/recursion';

/**
 * Nested loops (LevelDefinition.recursion, Level 8+): every committed loop is replayed by its echo and by
 * `copies` recursive copies delayed by k * delayTicks. These tests pin the engine contract.
 */
const DELAY = 120;
const withRecursion = (l: LevelDefinition, copies = 1): LevelDefinition => ({ ...l, recursion: { delayTicks: DELAY, copies } });

describe('nested loops (recursion)', () => {
  it('without recursion nothing changes: one actor per loop, no recursion fields', () => {
    const game = createGame(openRoom());
    playScript(game, [S.move(1, 0, 40)]);
    game.commitLoopAndRewind();
    const st = game.getState();
    expect(st.actors.map((a) => a.id)).toEqual(['echo:1', 'player']);
    expect(st.actors.every((a) => a.recursion === undefined)).toBe(true);
    expect(game.getTimeline().tracks.every((t) => t.recursion === undefined)).toBe(true);
  });

  it('each loop spawns its echo plus recursive copies, ordered loop by loop, the player last', () => {
    const game = createGame(withRecursion(openRoom(), 2));
    playScript(game, [S.move(1, 0, 30)]);
    game.commitLoopAndRewind();
    playScript(game, [S.move(0, 1, 30)]);
    game.commitLoopAndRewind();
    const st = game.getState();
    expect(st.actors.map((a) => a.id)).toEqual(['echo:1', 'echo:1.1', 'echo:1.2', 'echo:2', 'echo:2.1', 'echo:2.2', 'player']);
    expect(st.actors.map((a) => a.recursion ?? 0)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(st.actors.map((a) => a.echoIndex)).toEqual([0, 0, 0, 1, 1, 1, -1]);
    expect(st.actors.map((a) => a.loopId)).toEqual([1, 1, 1, 2, 2, 2, null]);
    expect(game.echoesRemaining).toBe(1); // copies are free
  });

  it('a copy waits on the spawn, then retraces the echo exactly delayTicks later', () => {
    const game = createGame(withRecursion(openRoom()));
    playScript(game, [S.move(1, 0, 50), S.move(0, 1, 30), S.wait(10)]);
    game.commitLoopAndRewind();
    const echoAt: { x: number; z: number }[] = [];
    const copyAt: { x: number; z: number }[] = [];
    for (let t = 0; t < DELAY + 100; t++) {
      game.step({ tick: t, moveX: 0, moveY: 0, interactPressed: false, interactHeld: false, actionPressed: false });
      const [echo, copy] = game.getState().actors;
      echoAt.push({ x: echo!.x, z: echo!.z });
      copyAt.push({ x: copy!.x, z: copy!.z });
    }
    expect(copyAt[DELAY - 1]).toEqual({ x: 7500, z: 6500 }); // still on the spawn cell centre
    for (let k = 0; k < 90; k++) expect(copyAt[DELAY + k]).toEqual(echoAt[k]);
    const st = game.getState();
    expect(st.actors[0]!.finished).toBe(true);
    expect(st.actors[1]!.finished).toBe(true);
  });

  it('copies are compared with the recording at their own (shifted) tick: a copy meeting a changed world diverges', () => {
    // Pick up the crate and carry it off; on replay the echo takes the crate first, so the copy's pickup fails.
    const level = withRecursion(crateRoom(1));
    const res = runScripts(level, [[S.moveTo(5, 2), S.face(1), S.interact(), S.moveTo(5, 3), S.wait(5)], [S.wait(DELAY + 120)]]);
    const ev = res.passes[1]!.events;
    const div = ev.filter((e) => e.type === 'divergence');
    expect(div).toHaveLength(1);
    expect(div[0]!.type === 'divergence' && div[0]!.actorId).toBe('echo:1.1');
    const pick = res.passes[0]!.events.find((e) => e.type === 'pickup')!;
    expect(div[0]!.tick).toBe(pick.tick + DELAY);
    expect(div[0]!.type === 'divergence' && div[0]!.expected.kind).toBe('pickup');
    // The original echo replayed faithfully.
    expect(ev.filter((e) => e.type === 'pickup' && e.actorId === 'echo:1')).toHaveLength(1);
    // Timeline: the copy has its own track, planned markers shifted by its start tick, divergence attached.
    const tl = res.game.getTimeline();
    const copy = tl.tracks.find((t) => t.actorId === 'echo:1.1')!;
    expect(copy.recursion).toBe(1);
    expect(copy.startTick).toBe(DELAY);
    expect(copy.echoIndex).toBe(0);
    expect(copy.planned[0]!.tick).toBe(pick.tick + DELAY);
    expect(copy.divergences).toHaveLength(1);
    const echo = tl.tracks.find((t) => t.actorId === 'echo:1')!;
    expect(echo.planned[0]!.tick).toBe(pick.tick);
    expect(echo.divergences).toHaveLength(0);
  });

  it('is deterministic: live pass, pure replay and snapshot re-simulation agree hash for hash', () => {
    const level = withRecursion(crateRoom(2));
    const scripts = [
      [S.moveTo(5, 2), S.face(1), S.interact(), S.moveTo(8, 3), S.face(2), S.interact(), S.wait(20)],
      [S.moveTo(3, 3), S.wait(40)],
      [S.wait(DELAY * 2 + 60)],
    ];
    const a = runScripts(level, scripts);
    const b = runScripts(level, scripts);
    a.passes.forEach((p, i) => expect(firstHashMismatch(p.hashes, b.passes[i]!.hashes)).toBe(-1));
    const replay = replayLoops(level, a.loops.slice(0, -1), a.loops[a.loops.length - 1]!.inputs);
    expect(firstHashMismatch(a.passes[2]!.hashes, replay.hashes)).toBe(-1);
    const g = a.game;
    for (const t of [0, 45, DELAY + 7, DELAY * 2 + 13]) expect(g.hashOf(g.getSnapshotAt(t))).toBe(a.passes[2]!.hashes[t - 1] ?? g.hashOf(g.getSnapshotAt(0)));
  });

  it('replayTracks/trackInputAt: idle before the offset and after the recording', () => {
    const level = withRecursion(openRoom());
    const loop = { id: 7, durationTicks: 3, inputs: [0, 1, 2].map((t) => ({ tick: t, moveX: 1 as const, moveY: 0 as const, interactPressed: false, interactHeld: false, actionPressed: false })), outcomes: [] };
    const tracks = replayTracks(level, [loop]);
    expect(tracks.map((t) => [t.actorId, t.offset])).toEqual([
      ['echo:7', 0],
      ['echo:7.1', DELAY],
    ]);
    expect(trackInputAt(tracks[1]!, DELAY - 1).moveX).toBe(0);
    expect(trackInputAt(tracks[1]!, DELAY).moveX).toBe(1);
    expect(trackInputAt(tracks[1]!, DELAY + 3).moveX).toBe(0);
    expect(replayTracks({ ...level, recursion: { delayTicks: 0 } }, [loop])).toHaveLength(1);
  });
});
