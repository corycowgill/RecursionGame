import type { LevelDefinition } from '../engine/contracts';
import type { CompletionResult } from '../gameplay/puzzles/completion';

/**
 * LEVEL PROGRESSION — pure, immutable campaign bookkeeping (no storage here: persistence serializes
 * CampaignProgress as plain JSON). Rule: the first level is always unlocked; each further level unlocks when the
 * previous one has been completed at least once. Round 6 inserted chambers mid-campaign, so a level also stays
 * unlocked once it (or any later level) has been completed: old saves keep every chamber they had reached, and the
 * new chambers before a save's furthest clear are open too.
 */

export interface LevelRecord {
  completions: number;
  bestTicks: number;
  bestEchoes: number;
  bestStars: 1 | 2 | 3;
}

export interface CampaignProgress {
  version: 1;
  records: Record<string, LevelRecord>;
}

export function emptyProgress(): CampaignProgress {
  return { version: 1, records: {} };
}

export function recordCompletion(progress: CampaignProgress, result: CompletionResult): CampaignProgress {
  const prev = progress.records[result.levelId];
  const next: LevelRecord = prev
    ? {
        completions: prev.completions + 1,
        bestTicks: Math.min(prev.bestTicks, result.ticks),
        bestEchoes: Math.min(prev.bestEchoes, result.echoesUsed),
        bestStars: (Math.max(prev.bestStars, result.stars) as 1 | 2 | 3),
      }
    : { completions: 1, bestTicks: result.ticks, bestEchoes: result.echoesUsed, bestStars: result.stars };
  return { ...progress, records: { ...progress.records, [result.levelId]: next } };
}

export function isCompleted(progress: CampaignProgress, levelId: string): boolean {
  return (progress.records[levelId]?.completions ?? 0) > 0;
}

/**
 * Shared unlock rule (Campaign.isUnlocked and the level-select entries): the first level; any level whose previous
 * level is completed; any level that is itself completed or lies before a completed level (saves made before
 * chambers were inserted mid-campaign keep their reach).
 */
export function levelUnlocked(levels: readonly LevelDefinition[], progress: CampaignProgress, index: number): boolean {
  if (index < 0 || index >= levels.length) return false;
  if (index === 0) return true;
  const prev = levels[index - 1];
  if (prev !== undefined && isCompleted(progress, prev.id)) return true;
  for (let j = index; j < levels.length; j++) {
    const l = levels[j];
    if (l !== undefined && isCompleted(progress, l.id)) return true;
  }
  return false;
}

export class Campaign {
  constructor(readonly levels: readonly LevelDefinition[]) {
    const seen = new Set<string>();
    levels.forEach((l, i) => {
      if (seen.has(l.id)) throw new Error(`Campaign: duplicate level id ${l.id}`);
      seen.add(l.id);
      if (l.order !== i + 1) throw new Error(`Campaign: ${l.id} has order ${l.order}, expected ${i + 1}`);
    });
  }

  get first(): LevelDefinition | null {
    return this.levels[0] ?? null;
  }

  indexOf(levelId: string): number {
    return this.levels.findIndex((l) => l.id === levelId);
  }

  get(levelId: string): LevelDefinition | null {
    return this.levels.find((l) => l.id === levelId) ?? null;
  }

  next(levelId: string): LevelDefinition | null {
    const i = this.indexOf(levelId);
    return i < 0 ? null : (this.levels[i + 1] ?? null);
  }

  isUnlocked(progress: CampaignProgress, levelId: string): boolean {
    const i = this.indexOf(levelId);
    if (i < 0) return false;
    return levelUnlocked(this.levels, progress, i);
  }

  unlocked(progress: CampaignProgress): LevelDefinition[] {
    return this.levels.filter((l) => this.isUnlocked(progress, l.id));
  }

  /** The level a "Continue" button should load: first unlocked-but-uncompleted, else the last level. */
  continueLevel(progress: CampaignProgress): LevelDefinition | null {
    for (const l of this.levels) if (this.isUnlocked(progress, l.id) && !isCompleted(progress, l.id)) return l;
    return this.levels[this.levels.length - 1] ?? null;
  }

  totalStars(progress: CampaignProgress): number {
    return this.levels.reduce((n, l) => n + (progress.records[l.id]?.bestStars ?? 0), 0);
  }
}
