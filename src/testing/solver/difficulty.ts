import { SIM_HZ, type LevelDefinition } from '../../engine/contracts';
import { runSolution } from '../harness/harness';
import type { SlackReport } from './slack';
import { verifySolution } from './verify';

/**
 * PLAYTIME / DIFFICULTY MODEL — derives a per-level difficulty score, a playtime range, a par time and progressive
 * hint delays from measurable properties of the level's verified solution. It is a MODEL, not a measurement: every
 * coefficient below is an assumption, stated next to it, to be replaced by playtest data. It exists so that par times
 * and hint delays are set CONSISTENTLY across chambers (same formula everywhere) rather than by feel per level.
 *
 * Inputs (all measured on the intended solution, through the real simulation):
 *   loops          echoes + the final run
 *   interactions   distinct interactions that do something in the winning pass (pick up, drop, insert, switch)
 *   pathTicks      ticks spent walking, summed over every loop
 *   recordTicks    total length of all recordings (what the player has to sit through once)
 *   constraints    timing parameters with a real window (slack sweep, < 10 s wide)
 *   tightestTicks  narrowest timing window (slack sweep)
 *   blind          some echo only works because of a later loop, or diverges on purpose (L07/L09/L10 lesson)
 *   recursion      the nested-loop engine is in play (L08)
 *   newIdeas       teaching tags introduced by the chamber
 *   bestTicks      fastest verified completion (solver or authored) — the par-time anchor
 */

export interface LevelMetrics {
  levelId: string;
  order: number;
  loops: number;
  interactions: number;
  pathTicks: number;
  recordTicks: number;
  constraints: number;
  tightestTicks: number | null;
  blind: boolean;
  recursion: boolean;
  newIdeas: number;
  bestTicks: number;
  authoredTicks: number;
}

export interface LevelEstimate {
  metrics: LevelMetrics;
  /** Abstract difficulty score (sum of weighted demands). */
  score: number;
  /** Seconds a typical first-time player spends, low / median / high. */
  seconds: { low: number; median: number; high: number };
  /** Model-derived par time (seconds) and hint delays (seconds; the first hint is always shown at 0). */
  parSeconds: number;
  hintDelays: number[];
}

/** Collects the metrics of a level's intended solution. `slack` from timingSlack(); `bestTicks` from the solver. */
export function measureLevel(level: LevelDefinition, slack: SlackReport | null, bestTicks?: number): LevelMetrics {
  const res = runSolution(level, { recordHashes: false });
  const loops = res.loops;
  let interactions = 0;
  let pathTicks = 0;
  let recordTicks = 0;
  for (const l of loops) {
    recordTicks += l.inputs.length;
    for (const p of l.inputs) if (p.moveX !== 0 || p.moveY !== 0) pathTicks++;
  }
  // distinct (actor, entity, kind) interactions that do something in the winning pass, by anyone
  const seen = new Set<string>();
  for (const e of res.passes[res.passes.length - 1]?.events ?? [])
    if (e.type === 'pickup' || e.type === 'drop' || e.type === 'interact') seen.add(`${e.actorId}|${e.entityId}|${e.type === 'interact' ? e.kind : e.type}`);
  interactions = seen.size;
  const echoes = loops.slice(0, -1).map((l, i) => ({ steps: [], loop: { ...l, id: i + 1 } }));
  const final = loops[loops.length - 1]!;
  const v = verifySolution(level, { levelId: level.id, echoes, final: { steps: [], inputs: final.inputs }, completedAtTick: res.completedAtTick ?? 0 });
  const constraints = slack ? slack.params.filter((p) => !p.capped && p.width < 600).length : 0;
  const authoredTicks = (res.completedAtTick ?? 0) + 1;
  return {
    levelId: level.id,
    order: level.order,
    loops: loops.length,
    interactions,
    pathTicks,
    recordTicks,
    constraints,
    tightestTicks: slack?.tightest ? slack.tightest.width : null,
    blind: v.dependsOnLater.some(Boolean) || v.divergences.length > 0,
    recursion: level.recursion !== undefined,
    newIdeas: level.teaches?.length ?? 0,
    bestTicks: Math.min(bestTicks ?? Infinity, authoredTicks),
    authoredTicks,
  };
}

/* ---- the model's assumptions (seconds unless noted) ------------------------------------------------------------ */

/** Reading the intro, the fly-through and looking around the chamber once. */
const ORIENT = 25;
/** Thinking per demand: per loop, per meaningful interaction, per timing constraint, per new idea. */
const PER_LOOP = 25;
const PER_INTERACTION = 15;
const PER_CONSTRAINT = 35;
const PER_IDEA = 12;
/** The two counter-intuitive lessons cost extra insight time: recording "blind" and nested loops. */
const BLIND_INSIGHT = 120;
const RECURSION_INSIGHT = 90;
/** Overhead per recording: rewind, re-orient, start walking (on top of the recording itself). */
const PER_RECORDING_OVERHEAD = 4;
/** Failed full attempts before the winning one: base + per extra loop + per constraint (+1 if a window < 3 s). */
const ATTEMPTS_BASE = 0.5;
const ATTEMPTS_PER_LOOP = 0.5;
const ATTEMPTS_PER_CONSTRAINT = 0.75;
/** Spread of real players around the median (fast puzzle fans vs. first-timers). */
const LOW_FACTOR = 0.5;
const HIGH_FACTOR = 2.2;
/**
 * The full-recipe hint arrives at 30 % of the median estimate, so roughly the slower half of players get the recipe
 * before they would otherwise finish. 0.3 is the average ratio of the round-4 authored delays to this model's
 * medians (0.28), so the overall hint pace stays where it was; only the per-level spacing becomes consistent.
 */
const HINT_LAST_FRACTION = 0.3;

export function estimateLevel(m: LevelMetrics, hintCount: number): LevelEstimate {
  const think =
    ORIENT +
    PER_LOOP * m.loops +
    PER_INTERACTION * m.interactions +
    PER_CONSTRAINT * m.constraints +
    PER_IDEA * m.newIdeas +
    (m.blind ? BLIND_INSIGHT : 0) +
    (m.recursion ? RECURSION_INSIGHT : 0);
  const oneAttempt = m.recordTicks / SIM_HZ + PER_RECORDING_OVERHEAD * m.loops;
  const tight = m.tightestTicks !== null && m.tightestTicks < 3 * SIM_HZ ? 1 : 0;
  const attempts = 1 + ATTEMPTS_BASE + ATTEMPTS_PER_LOOP * (m.loops - 2) + ATTEMPTS_PER_CONSTRAINT * m.constraints + tight;
  const median = think + attempts * oneAttempt;
  const score = think / 60 + attempts;
  // Par: the fastest verified final run + 25 % + 3 s, rounded up to a whole second (humane, consistent margin).
  const best = m.bestTicks / SIM_HZ;
  const parSeconds = Math.ceil(best * 1.25 + 3);
  // Hints: the first is shown at once (the goal); the last (the full recipe) at HINT_LAST_FRACTION of the median; the
  // ones between evenly spaced; rounded to 5 s and at least 15 s apart. (The HUD also unlocks a hint every 3 attempts.)
  const hintDelays: number[] = [0];
  const timed = Math.max(0, hintCount - 1);
  for (let i = 1; i <= timed; i++) {
    let t = Math.round((median * HINT_LAST_FRACTION * i) / timed / 5) * 5;
    t = Math.max(t, hintDelays[hintDelays.length - 1]! + 15);
    hintDelays.push(t);
  }
  return {
    metrics: m,
    score: Math.round(score * 10) / 10,
    seconds: { low: Math.round(median * LOW_FACTOR), median: Math.round(median), high: Math.round(median * HIGH_FACTOR) },
    parSeconds,
    hintDelays,
  };
}
