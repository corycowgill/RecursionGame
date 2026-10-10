import { describe, expect, it } from 'vitest';
import { sanitizeInput, type LevelDefinition, type PlayerInput, type TemporalLoop } from '../../engine/contracts';
import { rngNext, seedRng } from '../../engine/simulation/rng';
import { completionFromEvents } from '../../gameplay/puzzles/completion';
import { LEVELS } from '../../levels';
import { SAVE_KEY, SaveStore } from '../../persistence/save';
import { MemoryStorage } from '../../persistence/storage';
import { createGame, firstHashMismatch, playInputs, runSolution } from '../harness/harness';

/**
 * SAVE / LOAD integration: persisted echoes must reproduce the exact same timeline after a "reload" (a new
 * SaveStore over the same storage), and no corrupt or stale save may crash the load path the app uses
 * (SaveStore -> getLevelLoops -> try { game.setLoops } catch { clear }).
 */

const finalInputs = (loops: readonly TemporalLoop[]): PlayerInput[] => [...(loops[loops.length - 1]?.inputs ?? [])];

/** Random dense inputs covering every packed bit combination. */
function randomLoop(seed: number, id: number, ticks: number): TemporalLoop {
  let s = seedRng(seed);
  const inputs: PlayerInput[] = [];
  for (let t = 0; t < ticks; t++) {
    const r = rngNext(s);
    s = r.state;
    const run = r.value % 7 === 0;
    const prev = inputs[t - 1];
    if (run && prev) {
      inputs.push({ ...prev, tick: t });
      continue;
    }
    inputs.push(
      sanitizeInput(
        {
          tick: t,
          moveX: ((r.value % 3) - 1) as -1 | 0 | 1,
          moveY: (((r.value >>> 3) % 3) - 1) as -1 | 0 | 1,
          interactPressed: (r.value & 0x100) !== 0,
          interactHeld: (r.value & 0x200) !== 0,
          actionPressed: (r.value & 0x400) !== 0,
        },
        t,
      ),
    );
  }
  return { id, durationTicks: ticks, inputs, outcomes: [] };
}

/** What bootstrap does when Continue restores a chamber. Returns the number of echoes restored. */
function appRestore(save: SaveStore, level: LevelDefinition): { restored: number; game: ReturnType<typeof createGame> } {
  const game = createGame(level);
  const loops = save.getLevelLoops(level.id);
  let restored = 0;
  if (loops.length) {
    try {
      game.setLoops(loops);
      restored = loops.length;
    } catch {
      save.setLevelLoops(level.id, []);
    }
  }
  return { restored, game };
}

describe('save/load: persisted echoes replay identically after a reload', () => {
  for (const level of LEVELS) {
    it(`${level.id}: solution echoes saved mid-level reproduce the exact per-tick hashes`, () => {
      const storage = new MemoryStorage();
      const sol = runSolution(level);
      const echoes = sol.loops.slice(0, -1);
      // Session 1: commit the echoes, save them (as the app does on commit).
      const s1 = new SaveStore({ storage });
      s1.setLevelLoops(level.id, echoes);
      s1.setLastLevel(level.id);
      // Session 2: a fresh store over the same storage (page reload).
      const s2 = new SaveStore({ storage });
      expect(s2.data.lastLevelId).toBe(level.id);
      const { restored, game } = appRestore(s2, level);
      expect(restored).toBe(echoes.length);
      const replay = playInputs(game, finalInputs(sol.loops));
      expect(replay.completed).toBe(true);
      expect(firstHashMismatch(sol.passes[sol.passes.length - 1]!.hashes, replay.hashes)).toBe(-1);

      // Completing the level records progress and clears the saved echoes; both survive another reload.
      const result = completionFromEvents(level, replay.events);
      expect(result).not.toBeNull();
      s2.recordResult(result!);
      const s3 = new SaveStore({ storage });
      expect(s3.getLevelLoops(level.id)).toEqual([]);
      expect(s3.data.progress.records[level.id]?.completions).toBe(1);
      expect(s3.data.progress.records[level.id]?.bestTicks).toBe(result!.ticks);
    });
  }

  it('random loops covering every input bit combination round-trip exactly through storage', () => {
    const storage = new MemoryStorage();
    const loops = [randomLoop(1, 1, 1800), randomLoop(2, 4, 1), randomLoop(3, 9, 777)];
    new SaveStore({ storage }).setLevelLoops('L-any', loops);
    const back = new SaveStore({ storage }).getLevelLoops('L-any');
    expect(back.map((l) => [l.id, l.durationTicks])).toEqual(loops.map((l) => [l.id, l.durationTicks]));
    back.forEach((l, i) => expect(l.inputs).toEqual(loops[i]!.inputs));
  });

  it('a fuzzed echo set replays bit-identically after save + reload (game-level hash equality)', () => {
    const level = LEVELS[LEVELS.length - 1]!;
    const g1 = createGame(level);
    const committed: TemporalLoop[] = [];
    for (let i = 0; i < level.maxEchoes; i++) {
      playInputs(g1, randomLoop(100 + i, 0, 400).inputs, undefined, { recordHashes: false });
      expect(g1.commitLoopAndRewind()).toBe(true);
    }
    committed.push(...g1.getLoops());
    const live = playInputs(g1, randomLoop(999, 0, 600).inputs);
    const storage = new MemoryStorage();
    new SaveStore({ storage }).setLevelLoops(level.id, committed);
    const { game } = appRestore(new SaveStore({ storage }), level);
    const again = playInputs(game, randomLoop(999, 0, 600).inputs);
    expect(firstHashMismatch(live.hashes, again.hashes)).toBe(-1);
    // Divergence expectations (outcomes) survive too: the restored timeline marks the same plan.
    expect(game.getTimeline().tracks.map((t) => t.planned.length)).toEqual(g1.getTimeline().tracks.map((t) => t.planned.length));
  });
});

describe('save/load: corrupt and stale saves never break the load path', () => {
  const level = LEVELS[0]!;
  const raw = (loops: unknown): string =>
    JSON.stringify({ version: 1, progress: { records: {} }, settings: {}, keybinds: undefined, seenTutorials: [], loops: { [level.id]: loops }, lastLevelId: level.id });

  const cases: [string, string][] = [
    ['truncated JSON', raw([]).slice(0, 40)],
    ['loops is a string', raw('nope')],
    ['run lengths disagree with durationTicks', raw([{ v: 1, id: 1, durationTicks: 50, runs: [10, 5], outcomes: [] }])],
    ['negative / float run values', raw([{ v: 1, id: 1, durationTicks: 3, runs: [-1, 5, 1.5, 2], outcomes: [] }])],
    ['unknown codec version', raw([{ v: 7, id: 1, durationTicks: 1, runs: [1, 5], outcomes: [] }])],
    ['out-of-range packed input bits', raw([{ v: 1, id: 1, durationTicks: 4, runs: [4, 255], outcomes: [] }])],
    ['junk outcomes', raw([{ v: 1, id: 1, durationTicks: 4, runs: [4, 5], outcomes: [null, 5, { tick: 'x' }, { tick: 0, verb: 'interact', kind: 'pickup', entityId: 'nope' }] }])],
    ['more loops than the level allows', raw(Array.from({ length: level.maxEchoes + 3 }, (_, i) => ({ v: 1, id: i + 1, durationTicks: 2, runs: [2, 5], outcomes: [] })))],
    ['loop longer than the chamber', raw([{ v: 1, id: 1, durationTicks: level.loopDurationTicks * 3, runs: [level.loopDurationTicks * 3, 6], outcomes: [] }])],
    ['absurd durationTicks (memory bomb)', raw([{ v: 1, id: 1, durationTicks: 2_000_000_000, runs: [2_000_000_000, 5], outcomes: [] }])],
  ];

  for (const [name, text] of cases) {
    it(`${name}: loads without throwing and the chamber stays playable`, () => {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, text);
      const t0 = Date.now();
      const save = new SaveStore({ storage });
      expect(Date.now() - t0).toBeLessThan(2000);
      const { game } = appRestore(save, level);
      expect(game.getLoops().length).toBeLessThanOrEqual(level.maxEchoes);
      // The restored chamber must step, scrub, report a timeline and accept a commit without throwing.
      expect(() => {
        playInputs(game, [], 300, { recordHashes: false });
        game.getSnapshotAt(150);
        game.getTimeline();
        game.commitLoopAndRewind();
        game.drainEvents();
      }).not.toThrow();
      for (const a of game.getState().actors) expect(Number.isFinite(a.x) && Number.isFinite(a.z)).toBe(true);
    });
  }

  it('out-of-range packed bits decode to legal inputs (moveX/moveY in -1..1)', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, cases.find((c) => c[0] === 'out-of-range packed input bits')![1]);
    const { game } = appRestore(new SaveStore({ storage }), level);
    for (const loop of game.getLoops()) for (const i of loop.inputs) expect([i.moveX, i.moveY].every((m) => m >= -1 && m <= 1)).toBe(true);
  });
});
