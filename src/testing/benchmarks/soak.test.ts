import { describe, expect, it } from 'vitest';
import type { PlayerInput } from '../../engine/contracts';
import { rngNext } from '../../engine/simulation/rng';
import { crateRoom } from '../harness/fixtures';
import { createGame, firstHashMismatch, playInputs } from '../harness/harness';

/** Seeded fuzz inputs including interactions (pickups/drops/failed drops) for soak runs. */
function fuzz(seed: number, ticks: number): PlayerInput[] {
  let s = seed >>> 0;
  const out: PlayerInput[] = [];
  let mx: -1 | 0 | 1 = 0;
  let mz: -1 | 0 | 1 = 0;
  for (let t = 0; t < ticks; t++) {
    const r = rngNext(s);
    s = r.state;
    if (t % 12 === 0) {
      mx = ((r.value % 3) - 1) as -1 | 0 | 1;
      mz = (((r.value >>> 4) % 3) - 1) as -1 | 0 | 1;
    }
    const press = (r.value >>> 12) % 40 === 0;
    out.push({ tick: t, moveX: mx, moveY: mz, interactPressed: press, interactHeld: press, actionPressed: (r.value >>> 20) % 97 === 0 });
  }
  return out;
}

describe('soak', () => {
  it('3 fuzzed echoes + player over 3000 ticks: deterministic across runs, snapshots consistent', () => {
    const level = { ...crateRoom(3), loopDurationTicks: 3000 };
    const run = (): { hashes: number[]; ms: number; game: ReturnType<typeof createGame> } => {
      const game = createGame(level, { snapshotInterval: 60 });
      for (let i = 0; i < 3; i++) {
        playInputs(game, fuzz(100 + i, 3000), undefined, { recordHashes: false });
        expect(game.commitLoopAndRewind()).toBe(true);
      }
      const t0 = Date.now();
      const pass = playInputs(game, fuzz(999, 3000));
      return { hashes: pass.hashes, ms: Date.now() - t0, game };
    };
    const a = run();
    const b = run();
    expect(a.hashes.length).toBeGreaterThan(1000);
    expect(firstHashMismatch(a.hashes, b.hashes)).toBe(-1);
    for (const t of [1, 777, 1500, a.hashes.length]) expect(a.game.hashOf(a.game.getSnapshotAt(t))).toBe(a.hashes[t - 1]);
    // perf sanity: 4 actors with per-tick hashing well above real time (60 ticks/s)
    const ticksPerSecond = (a.hashes.length / Math.max(1, a.ms)) * 1000;
    expect(ticksPerSecond).toBeGreaterThan(600);
  });
});
