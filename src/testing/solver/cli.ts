import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { LevelDefinition } from '../../engine/contracts';
import { LEVELS } from '../../levels';
import { levelJobs, mergeShards, runJob, type Job, type JobKind, type JobResult } from './analysis';
import { analysisFor } from './levelConfigs';
import { timingSlack } from './slack';

/**
 * PUZZLE SOLVER CLI — `npm run solve -- <level...> [options]` (bundled and launched by run.mjs).
 *
 *   npm run solve -- L07                    find + min-echo proof + cheese searches for Level 7
 *   npm run solve -- L01 L02 L03 --budget=120
 *   npm run solve -- all --kinds=proof --workers=3
 *   npm run solve -- L05 --slack            also sweep the timing slack of the known solution
 *   npm run solve -- L02 --echoes=1 --echo-steps=2 --final-steps=1     one ad-hoc search with custom bounds
 *
 * Options: --budget=<s per job> (default 300) · --workers=<n> (default min(3, cpus-1)) · --kinds=find,proof,cheese ·
 *          --json=<file> (write every job result) · --slack · --max=<solutions> · --blind=none
 * Each job is split into shards over worker threads (shard = first-level branch index mod workers).
 */

interface WorkerTask {
  job: Job;
}

function levelById(id: string): LevelDefinition {
  const l = LEVELS.find((x) => x.id === id || x.id.startsWith(id + '-') || x.id.startsWith(id));
  if (!l) throw new Error(`unknown level '${id}'`);
  return l;
}

if (!isMainThread) {
  const { job } = workerData as WorkerTask;
  const res = runJob(levelById(job.levelId), job);
  parentPort!.postMessage(res);
} else {
  void main();
}

function runSharded(job: Job, workers: number): Promise<JobResult> {
  if (workers <= 1) return Promise.resolve(runJob(levelById(job.levelId), job));
  const parts = Array.from(
    { length: workers },
    (_, index) =>
      new Promise<JobResult>((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { job: { ...job, shard: { index, count: workers } } } satisfies WorkerTask });
        w.once('message', (m: JobResult) => {
          resolve(m);
          void w.terminate();
        });
        w.once('error', reject);
      }),
  );
  return Promise.all(parts).then(mergeShards);
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fmtBounds(j: Job): string {
  const b = j.bounds;
  const v = b.vocab ?? {};
  const extra = [
    v.blind && v.blind !== 'all' ? `blind=${Array.isArray(v.blind) ? v.blind.join('|') : v.blind}` : '',
    v.signals ? `signals=[${v.signals.join(',')}]` : '',
    v.fixedWaits ? `waits=[${v.fixedWaits.join(',')}]` : '',
    v.onlyTasks ? `only=[${v.onlyTasks.join(',')}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `echoes=${b.echoes} echoSteps=${b.echoSteps} finalSteps=${b.finalSteps}${extra ? ' ' + extra : ''}`;
}

function report(r: JobResult): void {
  const status = r.exhaustive ? 'EXHAUSTIVE' : r.budgetExceeded ? 'BUDGET' : 'STOPPED';
  const head = `  [${r.job.kind}] ${fmtBounds(r.job)}  ->  ${r.solutions.length} solution(s), ${status}`;
  console.log(head);
  console.log(
    `      vocab ${r.vocab.tasks} tasks x ${r.vocab.waits} waits · echo plans ${r.echoPlans.join('/') || '-'} · final runs ${r.finalRuns} · ${r.nodes} nodes · ${(r.ticks / 1e6).toFixed(2)}M ticks · ${(r.elapsedMs / 1000).toFixed(1)} s`,
  );
  for (const s of r.solutions.slice(0, 3)) {
    console.log(`      ${s.verified ? 'verified' : 'UNVERIFIED'} · ${s.echoes} echo(es) · complete @ ${s.completedAtTick} (${(s.completedAtTick / 60).toFixed(2)} s)${s.teachingViolation ? ` · TEACHING: ${s.teachingViolation}` : ''}${s.divergences ? ` · ${s.divergences} divergence(s)` : ''}`);
    for (const line of s.plan) console.log(`         ${line}`);
  }
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const levels = ids.length === 0 || ids.includes('all') ? [...LEVELS] : ids.map(levelById);
  const budgetMs = Number(arg('budget') ?? 300) * 1000;
  const workers = Number(arg('workers') ?? Math.max(1, Math.min(3, cpus().length - 1)));
  const kinds = (arg('kinds')?.split(',') ?? ['find', 'proof', 'cheese']) as JobKind[];
  const results: JobResult[] = [];
  const slack: unknown[] = [];
  for (const level of levels) {
    const cfg = analysisFor(level);
    console.log(`\n${level.id}  (intended ${cfg.intended} echo(es), limit ${level.maxEchoes}, par ${level.parTimeSeconds} s)`);
    let jobs: Job[];
    if (arg('echoes') !== undefined) {
      const blind = arg('blind');
      jobs = [
        {
          kind: (arg('kind') as JobKind | undefined) ?? 'proof',
          levelId: level.id,
          bounds: {
            echoes: Number(arg('echoes')),
            echoSteps: Number(arg('echo-steps') ?? 2),
            finalSteps: Number(arg('final-steps') ?? 1),
            ...(blind ? { vocab: { blind: blind as 'none' | 'all' } } : {}),
          },
          budgetMs,
          maxSolutions: Number(arg('max') ?? 3),
        },
      ];
    } else jobs = levelJobs(level, budgetMs, kinds);
    for (const job of jobs) {
      const r = await runSharded(job, workers);
      results.push(r);
      report(r);
    }
    if (flag('slack')) {
      const s = timingSlack(level);
      slack.push(s);
      console.log(`  [slack] ${s.runs} runs`);
      for (const p of s.params)
        console.log(`      loop ${p.loop + 1} step ${p.step} ${p.op} ${p.authored}: works in [${Math.max(p.lo, p.reached)}, ${p.hi}]${p.capped ? '+' : ''} -> ${p.width} ticks`);
    }
  }
  const json = arg('json');
  if (json) {
    writeFileSync(json, JSON.stringify({ results, slack }, null, 1));
    console.log(`\nwrote ${json}`);
  }
}
