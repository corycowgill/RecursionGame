import type { LevelDefinition, SimView } from '../../engine/contracts';
import type { SearchBounds } from './search';
import type { VerifiedSolution } from './verify';

/**
 * PER-LEVEL ANALYSIS CONFIGURATION — the documented bounds of every search the solver runs, and the teaching goal of
 * each chamber expressed as a machine check.
 *
 *  intended    the echo count the chamber is designed around (= parEchoes)
 *  proof       bounds for the "fewer echoes than intended" searches (run for every k < intended). Exhaustive within
 *              these bounds => "no solution with k echoes exists in this vocabulary".
 *  find        bounds under which the solver must REDISCOVER a solution with the intended echo count — evidence that
 *              the vocabulary is expressive enough for the proof to mean something.
 *  cheese      extra searches within the echo limit whose solutions are checked against `teaching`.
 *  teaching    returns null when a verified solution exercises the chamber's lesson, or a reason when it bypasses it.
 *  ci          a reduced proof for `npm test` (levels 1-4 only), small enough to run in seconds.
 */

export interface LevelAnalysisConfig {
  intended: number;
  proof: Omit<SearchBounds, 'echoes'>;
  find: Omit<SearchBounds, 'echoes'>;
  cheese?: SearchBounds[];
  teaching?: (v: VerifiedSolution, level: LevelDefinition) => string | null;
  ci?: Omit<SearchBounds, 'echoes'>;
  /** Free-text notes on why the bounds are what they are (copied into the report). */
  notes?: string;
}

function entityCell(view: SimView, id: string): { col: number; row: number; carried: boolean } | null {
  const e = view.entities[id];
  if (!e) return null;
  return { col: Math.floor(e.x / 1000), row: Math.floor(e.z / 1000), carried: e.carriedBy !== null };
}

function onCellOf(view: SimView, item: string, target: string): boolean {
  const a = entityCell(view, item);
  const b = entityCell(view, target);
  return a !== null && b !== null && !a.carried && a.col === b.col && a.row === b.row;
}

export const LEVEL_ANALYSIS: Record<string, LevelAnalysisConfig> = {
  'L01-first-echo': {
    intended: 1,
    proof: { echoSteps: 0, finalSteps: 2 },
    find: { echoSteps: 1, finalSteps: 0 },
    ci: { echoSteps: 0, finalSteps: 2 },
    notes: 'Zero echoes: every two-step final run (stand, wait, doorway) is tried.',
  },
  'L02-two-places': {
    intended: 2,
    proof: { echoSteps: 2, finalSteps: 1 },
    find: { echoSteps: 1, finalSteps: 0 },
    ci: { echoSteps: 1, finalSteps: 1, vocab: { blind: 'none' } },
  },
  'L03-the-relay': {
    intended: 2,
    proof: { echoSteps: 3, finalSteps: 1, vocab: { signals: ['switch-far', 'door-chrono'] } },
    find: { echoSteps: 4, finalSteps: 0, vocab: { blind: 'none', signals: ['door-chrono'] } },
    teaching: (v) =>
      onCellOf(v.finalState, 'crate-a', 'plate-crate') || onCellOf(v.finalState, 'crate-a', 'plate-watch')
        ? null
        : 'the crate is not on a plate at the finish',
    ci: { echoSteps: 1, finalSteps: 1, vocab: { blind: 'none', signals: [] } },
  },
  'L04-the-lift': {
    intended: 2,
    proof: { echoSteps: 2, finalSteps: 2 },
    find: { echoSteps: 2, finalSteps: 0, vocab: { blind: 'none' } },
    ci: { echoSteps: 1, finalSteps: 1, vocab: { blind: 'none' } },
  },
  'L05-perfect-timing': {
    intended: 2,
    proof: { echoSteps: 2, finalSteps: 1 },
    find: { echoSteps: 1, finalSteps: 0, vocab: { blind: 'none' } },
  },
  'L06-chain-reaction': {
    intended: 3,
    proof: { echoSteps: 1, finalSteps: 1 },
    find: { echoSteps: 2, finalSteps: 0, vocab: { blind: 'none' } },
  },
  'L07-broken-sequence': {
    intended: 2,
    proof: { echoSteps: 2, finalSteps: 1 },
    find: { echoSteps: 2, finalSteps: 0 },
    teaching: (v) => (v.divergences.length > 0 ? null : 'no echo diverged: the honest route worked'),
  },
  'L08-recursive-machine': {
    intended: 1,
    proof: { echoSteps: 0, finalSteps: 2 },
    find: { echoSteps: 2, finalSteps: 0 },
  },
  'L09-paradox-chamber': {
    intended: 2,
    proof: { echoSteps: 2, finalSteps: 1 },
    find: { echoSteps: 2, finalSteps: 0 },
  },
  'L10-the-core': {
    intended: 3,
    proof: { echoSteps: 1, finalSteps: 1 },
    find: { echoSteps: 2, finalSteps: 0 },
  },
};

export function analysisFor(level: LevelDefinition): LevelAnalysisConfig {
  const c = LEVEL_ANALYSIS[level.id];
  if (!c) throw new Error(`no solver analysis config for ${level.id}`);
  return c;
}
