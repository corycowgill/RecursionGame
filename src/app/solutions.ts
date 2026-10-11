import type { LevelDefinition, PlayerInput, TemporalLoop } from '../engine/contracts';
import { compileSolution } from '../testing/harness/harness';

/**
 * Compiled known solutions (echo loops + final run inputs) for the main-menu attract replay and the debug hook's
 * `runSolution`. This module pulls in the headless test harness, so the app never imports it statically: it is
 * loaded on demand through `./lazySolutions` (after the menu's first paint, or when the debug hook needs it).
 * Pure: compiling runs a private headless game and never touches the live one.
 */
export interface KnownSolution {
  echoes: TemporalLoop[];
  final: PlayerInput[];
}

const solutionCache = new Map<string, KnownSolution>();

/** Cached per level id. Throws if the level's authored solution cannot be compiled. */
export function solutionFor(level: LevelDefinition): KnownSolution {
  let s = solutionCache.get(level.id);
  if (!s) {
    const loops = compileSolution(level);
    s = { echoes: loops.slice(0, -1), final: (loops[loops.length - 1]?.inputs ?? []).slice() };
    solutionCache.set(level.id, s);
  }
  return s;
}
