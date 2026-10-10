import { SIM_HZ, type LevelDefinition, type SimEvent } from '../../engine/contracts';

/**
 * PUZZLE COMPLETION — the engine decides completion (win check: the PLAYER on an active exit portal; contracts
 * §6). This module turns a completion into a result/rating for UI, progression and persistence.
 *
 * Rating (1–3 stars):
 *   ★     completed
 *   ★★    + used no more echoes than parEchoes (defaults to maxEchoes)
 *   ★★★   + the final run finished within parTimeSeconds
 */

export interface CompletionResult {
  levelId: string;
  /** Ticks of the winning pass (completedAtTick + 1). */
  ticks: number;
  /** Seconds (ticks / 60, rounded to 0.01) — UI convenience. */
  seconds: number;
  echoesUsed: number;
  parEchoes: number;
  parTimeSeconds: number;
  withinParEchoes: boolean;
  withinParTime: boolean;
  stars: 1 | 2 | 3;
}

export function evaluateCompletion(level: LevelDefinition, ticks: number, echoesUsed: number): CompletionResult {
  const parEchoes = level.parEchoes ?? level.maxEchoes;
  const withinParEchoes = echoesUsed <= parEchoes;
  const withinParTime = ticks <= level.parTimeSeconds * SIM_HZ;
  const stars: 1 | 2 | 3 = withinParEchoes ? (withinParTime ? 3 : 2) : 1;
  return {
    levelId: level.id,
    ticks,
    seconds: Math.round((ticks * 100) / SIM_HZ) / 100,
    echoesUsed,
    parEchoes,
    parTimeSeconds: level.parTimeSeconds,
    withinParEchoes,
    withinParTime,
    stars,
  };
}

/** Finds a levelComplete event in a batch (e.g. drainEvents()) and evaluates it; null if none. */
export function completionFromEvents(level: LevelDefinition, events: readonly SimEvent[]): CompletionResult | null {
  for (const e of events) {
    if (e.type === 'levelComplete' && e.levelId === level.id) return evaluateCompletion(level, e.ticks, e.echoesUsed);
  }
  return null;
}
