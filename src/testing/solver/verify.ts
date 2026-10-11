import type { LevelDefinition, SimEvent, SimView } from '../../engine/contracts';
import { replayLoops } from '../harness/harness';
import type { FoundSolution } from './search';

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
}

export function verifySolution(level: LevelDefinition, sol: FoundSolution): VerifiedSolution {
  const echoes = sol.echoes.map((e, i) => ({ ...e.loop, id: i + 1 }));
  const r = replayLoops(level, echoes, sol.final.inputs, { recordHashes: false });
  const divergences = r.events.flatMap((e) =>
    e.type === 'divergence' ? [{ actorId: e.actorId, expected: e.expected.kind, actual: e.actual.kind, entityId: e.actual.entityId }] : [],
  );
  return { ok: r.completed, completedAtTick: r.completedAtTick, events: r.events, finalState: r.game.getState(), divergences };
}

/** Human-readable plan: one line per loop. */
export function describeSolution(sol: FoundSolution): string[] {
  const lines = sol.echoes.map((e, i) => `Echo ${i + 1} (${e.loop.durationTicks}t): ${e.steps.join(' -> ') || '(idle)'}`);
  lines.push(`Final: ${sol.final.steps.join(' -> ')}  [complete @ tick ${sol.completedAtTick}]`);
  return lines;
}
