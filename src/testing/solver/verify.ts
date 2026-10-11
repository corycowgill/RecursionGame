import { IDLE_INPUT, type LevelDefinition, type PlayerInput, type SimEvent, type SimView, type TemporalLoop } from '../../engine/contracts';
import { replayLoops } from '../harness/harness';
import type { FoundSolution } from './search';
import { SolverWorld } from './world';

/**
 * Re-verifies a solver solution through the real TemporalGame (setLoops + live player inputs) — the same path the
 * golden replays use — and returns the winning pass's events and final state for teaching-goal checks.
 */
export interface VerifiedSolution {
  ok: boolean;
  completedAtTick: number | null;
  events: SimEvent[];
  finalState: SimView;
  divergences: { actorId: string; expected: string; actual: string; entityId: string | null }[];
  /**
   * Per echo: does its body move differently in the winning pass than in the world it was recorded in (loops before
   * it only)? True means the echo relies on something a LATER loop does — a blind recording ("inputs, not results").
   */
  dependsOnLater: boolean[];
  /** Levels with nested loops: does the same solution still complete with the Recursion Engine switched off? */
  completesWithoutRecursion: boolean | null;
}

/** Position trace (x, z per tick) of actor `index` over `ticks` ticks. */
function trace(level: LevelDefinition, echoes: readonly TemporalLoop[], player: readonly PlayerInput[], actorId: string, ticks: number): string {
  const w = new SolverWorld(level, echoes);
  const st = w.initial();
  const out: number[] = [];
  for (let t = 0; t < ticks && st.status === 'playing'; t++) {
    w.step(st, player[t] ?? { ...IDLE_INPUT, tick: t });
    const a = st.actors.find((x) => x.id === actorId);
    if (a) out.push(a.x, a.z);
  }
  return out.join(',');
}

export function verifySolution(level: LevelDefinition, sol: FoundSolution): VerifiedSolution {
  const echoes = sol.echoes.map((e, i) => ({ ...e.loop, id: i + 1 }));
  const r = replayLoops(level, echoes, sol.final.inputs, { recordHashes: false });
  const divergences = r.events.flatMap((e) =>
    e.type === 'divergence' ? [{ actorId: e.actorId, expected: e.expected.kind, actual: e.actual.kind, entityId: e.actual.entityId }] : [],
  );
  const end = r.completedAtTick ?? sol.final.inputs.length;
  const dependsOnLater = echoes.map((loop, i) => {
    const id = `echo:${loop.id}`;
    const ticks = Math.min(end, loop.durationTicks);
    return trace(level, echoes, sol.final.inputs, id, ticks) !== trace(level, echoes.slice(0, i + 1), [], id, ticks);
  });
  let completesWithoutRecursion: boolean | null = null;
  if (level.recursion) {
    const { recursion: _r, ...plain } = level;
    void _r;
    completesWithoutRecursion = replayLoops(plain, echoes, sol.final.inputs, { recordHashes: false }).completed;
  }
  return {
    ok: r.completed,
    completedAtTick: r.completedAtTick,
    events: r.events,
    finalState: r.game.getState(),
    divergences,
    dependsOnLater,
    completesWithoutRecursion,
  };
}

/** Human-readable plan: one line per loop. */
export function describeSolution(sol: FoundSolution): string[] {
  const lines = sol.echoes.map((e, i) => `Echo ${i + 1} (${e.loop.durationTicks}t): ${e.steps.join(' -> ') || '(idle)'}`);
  lines.push(`Final: ${sol.final.steps.join(' -> ')}  [complete @ tick ${sol.completedAtTick}]`);
  return lines;
}
