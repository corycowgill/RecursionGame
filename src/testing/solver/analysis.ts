import type { LevelDefinition } from '../../engine/contracts';
import { analysisFor } from './levelConfigs';
import { MacroSearch, type FoundSolution, type SearchBounds, type SearchResult } from './search';
import { describeSolution, verifySolution } from './verify';

/**
 * LEVEL ANALYSIS — the jobs the solver runs per level, and how their results combine. Jobs are plain data so the
 * CLI can shard them across worker threads; `runJob` is what a worker executes.
 */

export type JobKind = 'find' | 'proof' | 'cheese';

export interface Job {
  kind: JobKind;
  levelId: string;
  bounds: SearchBounds;
  budgetMs: number;
  maxSolutions: number;
  shard?: { index: number; count: number };
}

export interface JobSolution {
  plan: string[];
  echoes: number;
  completedAtTick: number;
  verified: boolean;
  teachingViolation: string | null;
  divergences: number;
  /** Raw loops, so a solution can be replayed / turned into a regression test. */
  loops: { inputs: [number, number, number][] }[];
}

export interface JobResult {
  job: Job;
  exhaustive: boolean;
  budgetExceeded: boolean;
  stoppedEarly: boolean;
  nodes: number;
  ticks: number;
  echoPlans: number[];
  finalRuns: number;
  elapsedMs: number;
  vocab: { tasks: number; waits: number };
  solutions: JobSolution[];
}

function compact(sol: FoundSolution): JobSolution['loops'] {
  const loops = [...sol.echoes.map((e) => e.loop.inputs), sol.final.inputs];
  return loops.map((inputs) => ({ inputs: inputs.map((p) => [p.moveX, p.moveY, p.interactPressed ? 1 : 0] as [number, number, number]) }));
}

export function runJob(level: LevelDefinition, job: Job): JobResult {
  const cfg = analysisFor(level);
  const search = new MacroSearch(level, job.bounds);
  const describe = (s: FoundSolution): JobSolution => {
    const v = verifySolution(level, s);
    return {
      plan: describeSolution(s),
      echoes: s.echoes.length,
      completedAtTick: v.completedAtTick ?? s.completedAtTick,
      verified: v.ok,
      teachingViolation: cfg.teaching ? cfg.teaching(v, level) : null,
      divergences: v.divergences.length,
      loops: compact(s),
    };
  };
  const accept =
    job.kind === 'cheese'
      ? (s: FoundSolution): boolean => {
          const d = describe(s);
          return d.verified && (d.echoes < cfg.intended || d.teachingViolation !== null);
        }
      : undefined;
  const opts = { budgetMs: job.budgetMs, maxSolutions: job.maxSolutions, ...(job.shard ? { shard: job.shard } : {}), ...(accept ? { accept } : {}) };
  const r: SearchResult = search.run(opts);
  return {
    job,
    exhaustive: r.exhaustive,
    budgetExceeded: r.budgetExceeded,
    stoppedEarly: r.stoppedEarly,
    nodes: r.stats.nodes,
    ticks: r.stats.ticks,
    echoPlans: r.stats.echoPlans,
    finalRuns: r.stats.finalRuns,
    elapsedMs: r.stats.elapsedMs,
    vocab: r.vocabSize,
    solutions: r.solutions.map(describe),
  };
}

/** Merges the shards of one job. */
export function mergeShards(parts: JobResult[]): JobResult {
  const first = parts[0]!;
  const { shard: _drop, ...job } = first.job;
  void _drop;
  return {
    job,
    exhaustive: parts.every((p) => p.exhaustive),
    budgetExceeded: parts.some((p) => p.budgetExceeded),
    stoppedEarly: parts.some((p) => p.stoppedEarly),
    nodes: parts.reduce((n, p) => n + p.nodes, 0),
    ticks: parts.reduce((n, p) => n + p.ticks, 0),
    echoPlans: first.echoPlans.map((_, i) => parts.reduce((n, p) => n + (p.echoPlans[i] ?? 0), 0)),
    finalRuns: parts.reduce((n, p) => n + p.finalRuns, 0),
    elapsedMs: Math.max(...parts.map((p) => p.elapsedMs)),
    vocab: first.vocab,
    solutions: parts.flatMap((p) => p.solutions).sort((a, b) => a.completedAtTick - b.completedAtTick),
  };
}

/** The standard job list for a level (find with the intended echo count, proofs for every smaller count, cheese). */
export function levelJobs(level: LevelDefinition, budgetMs: number, kinds: readonly JobKind[] = ['find', 'proof', 'cheese']): Job[] {
  const cfg = analysisFor(level);
  const jobs: Job[] = [];
  if (kinds.includes('find'))
    jobs.push({ kind: 'find', levelId: level.id, bounds: { ...cfg.find, echoes: cfg.intended }, budgetMs, maxSolutions: 25 });
  if (kinds.includes('proof'))
    for (let k = 0; k < cfg.intended; k++) {
      if (k > 0 && cfg.proof.echoSteps === 0) continue;
      jobs.push({ kind: 'proof', levelId: level.id, bounds: { ...cfg.proof, echoes: k }, budgetMs, maxSolutions: 3 });
    }
  if (kinds.includes('cheese'))
    for (const b of cfg.cheese ?? []) jobs.push({ kind: 'cheese', levelId: level.id, bounds: b, budgetMs, maxSolutions: 3 });
  return jobs;
}
