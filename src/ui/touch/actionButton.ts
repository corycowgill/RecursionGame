import type { EntityKind, LevelDefinition } from '../../engine/contracts';
import { CORE_BEHAVIOURS } from '../../gameplay/entities';

/**
 * TOUCH ACTION BUTTON RELEVANCE (round 4) — the on-screen button for the Space context action only appears when
 * it can matter, so the right-hand cluster stays uncluttered: while the player faces an entity whose behaviour
 * answers the context action (contracts §7: `action?(ctx)`), or for the whole chamber when the level's verified
 * solution uses the action. Pure (unit-tested).
 */

/** Entity kinds whose behaviour implements the Space context action. */
export const ACTION_KINDS: ReadonlySet<EntityKind> = new Set(CORE_BEHAVIOURS.filter((b) => typeof b.action === 'function').map((b) => b.kind));

const usesCache = new WeakMap<LevelDefinition, boolean>();

/** The level's verified solution presses the context action somewhere (or it is taught: `teaches` 'action'). */
export function levelUsesAction(level: LevelDefinition): boolean {
  let v = usesCache.get(level);
  if (v === undefined) {
    v = level.solution.some((script) => script.some((step) => step.op === 'action')) || (level.teaches ?? []).includes('action');
    usesCache.set(level, v);
  }
  return v;
}

export interface ActionButtonInput {
  level: LevelDefinition;
  /** An interaction is in reach and actionable now (prompt shown, not blocked). */
  promptActive: boolean;
  /** Kind of the faced entity (prompt target), if any. */
  entityKind: EntityKind | null;
}

/** Whether the touch Action button shows. */
export function actionButtonVisible(i: ActionButtonInput): boolean {
  if (levelUsesAction(i.level)) return true;
  return i.promptActive && i.entityKind !== null && ACTION_KINDS.has(i.entityKind);
}
