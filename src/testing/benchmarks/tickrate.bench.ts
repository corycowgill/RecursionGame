import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { expect, it } from 'vitest';
import { SIM_HZ, type LevelDefinition, type PlayerInput } from '../../engine/contracts';
import { rngNext, seedRng } from '../../engine/simulation/rng';
import { TemporalGame } from '../../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../../gameplay/entities';
import { LEVELS } from '../../levels';
import { componentGauntlet } from '../qa/fixtures';

/**
 * HEADLESS PERFORMANCE BENCHMARK — `npm run bench`.
 * For every campaign level (at its echo limit) plus the 12-component QA gauntlet at 3 and 5 echoes, it measures:
 *   step            TemporalGame.step() as the app runs it (trackPrevious on, snapshots every 30 ticks)
 *   step+hash       step() plus a world hash per tick (the test-harness / replay-verification mode)
 *   scrub           getSnapshotAt(random past tick) — timeline scrubbing (re-simulates from the nearest snapshot)
 *   preview         getSnapshotAt(now + 4 s) — the Q temporal preview
 *   timeline        getTimeline() — the per-frame UI read
 *   commit          commitLoopAndRewind() — R
 * Echo inputs are seeded random walks with interactions (so behaviours, collisions and replays all run).
 * Results are printed and written to test-results/benchmarks/tickrate.json. Thresholds only catch catastrophic
 * regressions (the sim must stay far above real time); absolute numbers depend on the machine.
 */

interface Row {
  scenario: string;
  echoes: number;
  stepTicksPerSec: number;
  stepUsPerTick: number;
  realtimeX: number;
  hashedTicksPerSec: number;
  scrubMs: number;
  previewMs: number;
  timelineUs: number;
  commitMs: number;
}

function walk(seed: number, ticks: number): PlayerInput[] {
  let s = seedRng(seed);
  const out: PlayerInput[] = [];
  let mx: -1 | 0 | 1 = 0;
  let mz: -1 | 0 | 1 = 0;
  for (let t = 0; t < ticks; t++) {
    const r = rngNext(s);
    s = r.state;
    if (t % 24 === 0) {
      mx = ((r.value % 3) - 1) as -1 | 0 | 1;
      mz = (((r.value >>> 4) % 3) - 1) as -1 | 0 | 1;
    }
    const press = (r.value >>> 12) % 45 === 0;
    out.push({ tick: t, moveX: mx, moveY: mz, interactPressed: press, interactHeld: press, actionPressed: (r.value >>> 20) % 90 === 0 });
  }
  return out;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const now = (): number => performance.now();

function build(level: LevelDefinition, echoes: number): TemporalGame {
  const game = new TemporalGame(createDefaultRegistry(), { snapshotInterval: 30, trackPrevious: true });
  game.loadLevel(level);
  for (let i = 0; i < echoes; i++) {
    for (const input of walk(1000 + i, level.loopDurationTicks)) if (!game.step(input).advanced) break;
    if (!game.commitLoopAndRewind()) throw new Error(`bench: cannot commit echo ${i} on ${level.id}`);
  }
  return game;
}

function measure(scenario: string, level: LevelDefinition, echoes: number): Row {
  const ticks = level.loopDurationTicks;
  const player = walk(4242, ticks);
  const stepRates: number[] = [];
  const hashRates: number[] = [];
  let game = build(level, echoes);
  for (let rep = 0; rep < 4; rep++) {
    game.resetLoop();
    let n = 0;
    const t0 = now();
    for (const input of player) {
      if (!game.step(input).advanced) break;
      n++;
    }
    const dt = now() - t0;
    if (rep > 0) stepRates.push((n / dt) * 1000); // rep 0 = warm-up (JIT)
    game.resetLoop();
    let m = 0;
    const t1 = now();
    for (const input of player) {
      if (!game.step(input).advanced) break;
      game.hash();
      m++;
    }
    if (rep > 0) hashRates.push((m / (now() - t1)) * 1000);
  }
  // game now holds a full pass: scrub / preview / timeline / commit costs.
  const cur = game.getState().tick;
  const scrubs: number[] = [];
  let s = seedRng(7);
  for (let i = 0; i < 40; i++) {
    const r = rngNext(s);
    s = r.state;
    const t = r.value % Math.max(1, cur);
    const t0 = now();
    game.getSnapshotAt(t);
    scrubs.push(now() - t0);
  }
  game.resetLoop();
  for (const input of player.slice(0, Math.floor(ticks / 2))) game.step(input);
  const previews: number[] = [];
  for (let i = 0; i < 6; i++) {
    game.step(player[game.getState().tick] ?? player[0]!); // a new tick invalidates the preview cache, as in play
    const t0 = now();
    game.getSnapshotAt(game.getState().tick + 4 * SIM_HZ);
    previews.push(now() - t0);
  }
  const tl: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t0 = now();
    game.getTimeline();
    tl.push(now() - t0);
  }
  const commits: number[] = [];
  for (let i = 0; i < 3; i++) {
    game = build(level, Math.max(0, echoes - 1));
    for (const input of player.slice(0, 600)) game.step(input);
    const t0 = now();
    game.commitLoopAndRewind();
    commits.push(now() - t0);
  }
  const step = median(stepRates);
  return {
    scenario,
    echoes,
    stepTicksPerSec: Math.round(step),
    stepUsPerTick: Math.round((1e6 / step) * 10) / 10,
    realtimeX: Math.round((step / SIM_HZ) * 10) / 10,
    hashedTicksPerSec: Math.round(median(hashRates)),
    scrubMs: Math.round(median(scrubs) * 100) / 100,
    previewMs: Math.round(median(previews) * 100) / 100,
    timelineUs: Math.round(median(tl) * 1000),
    commitMs: Math.round(median(commits) * 100) / 100,
  };
}

it('tick rate with max echoes, scrubbing, preview, timeline and commit costs', () => {
  const rows: Row[] = [];
  for (const level of LEVELS) rows.push(measure(level.id, level, level.maxEchoes));
  rows.push(measure('qa-gauntlet (12 kinds)', componentGauntlet(3), 3));
  rows.push(measure('qa-gauntlet (12 kinds)', componentGauntlet(5), 5));

  const header = ['scenario', 'echoes', 'ticks/s', 'us/tick', 'x realtime', 'ticks/s +hash', 'scrub ms', 'preview(4s) ms', 'timeline us', 'commit ms'];
  const lines = rows.map((r) => [r.scenario, r.echoes, r.stepTicksPerSec, r.stepUsPerTick, r.realtimeX, r.hashedTicksPerSec, r.scrubMs, r.previewMs, r.timelineUs, r.commitMs].map(String));
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => (l[i] ?? '').length)));
  const fmt = (cols: string[]): string => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  const table = [fmt(header), widths.map((w) => '-'.repeat(w)).join('  '), ...lines.map(fmt)].join('\n');
  const env = `node ${process.version}, ${cpus().length}x ${cpus()[0]?.model ?? 'cpu'}`;
  process.stdout.write(`\nRECURSION headless benchmark (${env})\n${table}\n`);
  mkdirSync('test-results/benchmarks', { recursive: true });
  writeFileSync('test-results/benchmarks/tickrate.json', JSON.stringify({ env, date: new Date().toISOString(), rows }, null, 2));

  for (const r of rows) {
    // Catastrophic-regression guards (real time is 60 ticks/s; one tick per 16.7 ms frame).
    expect(r.stepTicksPerSec, `${r.scenario} step rate`).toBeGreaterThan(SIM_HZ * 20);
    expect(r.scrubMs, `${r.scenario} scrub`).toBeLessThan(50);
    expect(r.previewMs, `${r.scenario} preview`).toBeLessThan(250);
    expect(r.timelineUs, `${r.scenario} timeline`).toBeLessThan(2000);
  }
});
