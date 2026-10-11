import type { LevelDefinition, SimView } from '../../engine/contracts';
import type { SearchBounds } from './search';
import type { VerifiedSolution } from './verify';

/**
 * PER-LEVEL ANALYSIS CONFIGURATION — the documented bounds of every search the solver runs, and the teaching goal of
 * each chamber expressed as a machine check.
 *
 *  intended    the echo count the chamber is designed around (= parEchoes)
 *  proof       bound sets for the "fewer echoes than intended" searches (each run for every k < intended). Exhaustive
 *              within a bound set => "no solution with k echoes exists in that vocabulary". Typically one DEEP set
 *              (more steps, few waits, live walking only) and one WIDE set (fewer steps, every wait, blind walking).
 *  find        bounds under which the solver must REDISCOVER a solution with the intended echo count — evidence that
 *              the vocabulary is expressive enough for the proof to mean something. From L03 on, `find` restricts the
 *              task list to the tasks the intended plan uses (onlyTasks), so it answers "is the intended plan a
 *              plan of this vocabulary?" quickly instead of re-searching the whole space.
 *  cheese      extra searches within the echo limit whose solutions are checked against `teaching`.
 *  teaching    returns null when a verified solution exercises the chamber's lesson, or a reason when it bypasses it.
 *  ci          a reduced proof for `npm test` (levels 1-4 only), small enough to run in seconds.
 */

export interface LevelAnalysisConfig {
  intended: number;
  /** One or more bound sets; each is searched for every k < intended. */
  proof: Omit<SearchBounds, 'echoes'>[];
  find: Omit<SearchBounds, 'echoes'>;
  cheese?: SearchBounds[];
  teaching?: (v: VerifiedSolution, level: LevelDefinition) => string | null;
  ci?: Omit<SearchBounds, 'echoes'>;
  /** Intended plan in step labels (echo loops, then final pre-exit steps), checked directly when `find` runs out of time. */
  plan?: { echoes: string[][]; final?: string[] };
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

/** DEEP bounds: up to `steps` tasks per echo, no waits, live walking only (pure task sequences). */
function deep(steps: number, finalSteps = 1): Omit<SearchBounds, 'echoes'> {
  return { echoSteps: steps, finalSteps, vocab: { fixedWaits: [], signals: [], blind: 'none' } };
}

/** WIDE bounds: up to `steps` tasks per echo, every wait (fixed 1 s / 3 s and the listed signal edges), blind walking. */
function wide(steps: number, signals?: string[], finalSteps = 1): Omit<SearchBounds, 'echoes'> {
  return { echoSteps: steps, finalSteps, vocab: signals ? { signals } : {} };
}

/** Restricts a bound set to the tasks the intended plan uses ("is the intended plan expressible?"). */
function only(b: Omit<SearchBounds, 'echoes'>, tasks: string[]): Omit<SearchBounds, 'echoes'> {
  return { ...b, vocab: { ...b.vocab, onlyTasks: tasks } };
}

const usesBlindEcho = (v: VerifiedSolution): string | null =>
  v.dependsOnLater.some(Boolean) ? null : 'no echo depends on a later loop: nothing was recorded "blind"';

export const LEVEL_ANALYSIS: Record<string, LevelAnalysisConfig> = {
  'L01-first-echo': {
    intended: 1,
    proof: [{ echoSteps: 0, finalSteps: 3 }],
    find: { echoSteps: 1, finalSteps: 0 },
    ci: { echoSteps: 0, finalSteps: 2 },
  },
  'L02-two-places': {
    intended: 2,
    proof: [deep(3), wide(2)],
    find: { echoSteps: 1, finalSteps: 0 },
    ci: deep(2),
  },
  'L03-the-relay': {
    intended: 2,
    proof: [deep(3), wide(2, ['switch-far', 'door-chrono'])],
    find: only(deep(3, 0), ['pick crate-a', 'drop-on plate-crate', 'stand plate-watch', 'press switch-far']),
    teaching: (v) =>
      onCellOf(v.finalState, 'crate-a', 'plate-crate') || onCellOf(v.finalState, 'crate-a', 'plate-watch')
        ? null
        : 'the crate is not on a plate at the finish',
    cheese: [{ ...deep(3, 0), echoes: 2 }],
    ci: deep(2),
  },
  'L04-the-lift': {
    intended: 2,
    proof: [deep(3), wide(2)],
    find: only(deep(2, 0), ['stand plate-call', 'board lift', 'stand plate-gallery']),
    ci: deep(2),
  },
  'L05-perfect-timing': {
    intended: 2,
    proof: [deep(3), wide(2)],
    find: { echoSteps: 2, finalSteps: 0, vocab: { onlyTasks: ['press switch-drive', 'press switch-gate', 'hold'], blind: 'none' } },
  },
  'L06-chain-reaction': {
    intended: 3,
    proof: [deep(2), { echoSteps: 1, finalSteps: 1, vocab: { signals: [] } }],
    find: { echoSteps: 2, finalSteps: 0, vocab: { blind: 'none', fixedWaits: [], signals: ['receiver-b'], onlyTasks: ['stand plate-hall', 'press switch-relay', 'stand plate-vault'] } },
    notes: 'Two echoes x two steps is the largest exhaustive set that fits a run; the fixed level also has a body-count proof.',
  },
  'L07-broken-sequence': {
    intended: 2,
    proof: [deep(3), wide(2, ['door-archive', 'door-west', 'switch-archive'])],
    find: { echoSteps: 2, finalSteps: 0, vocab: { fixedWaits: [180], signals: [], blind: 'none', onlyTasks: ['stand plate-hall', 'press switch-archive', 'stand plate-reading'] } },
    teaching: usesBlindEcho,
    cheese: [{ ...deep(3, 0), echoes: 2 }],
  },
  'L08-recursive-machine': {
    intended: 1,
    proof: [{ echoSteps: 0, finalSteps: 3 }],
    find: { echoSteps: 2, finalSteps: 0, vocab: { fixedWaits: [330], signals: [], blind: 'none', onlyTasks: ['stand plate-feed', 'stand plate-shaft'] } },
    teaching: (v) => (v.completesWithoutRecursion === false ? null : 'still completes with the Recursion Engine switched off'),
    cheese: [{ echoes: 1, echoSteps: 2, finalSteps: 1, vocab: { signals: [] } }],
  },
  'L09-paradox-chamber': {
    intended: 2,
    proof: [deep(3), wide(2, ['door-west', 'door-vault', 'door-spire'])],
    find: { echoSteps: 2, finalSteps: 0, vocab: { fixedWaits: [180], signals: [], onlyTasks: ['stand plate-hall', 'stand plate-vault', 'stand plate-reading'] } },
    teaching: usesBlindEcho,
  },
  'L10-the-core': {
    intended: 3,
    proof: [{ echoSteps: 2, finalSteps: 1, vocab: { fixedWaits: [], signals: [], blind: 'none' } }],
    find: {
      echoSteps: 3,
      finalSteps: 0,
      vocab: {
        fixedWaits: [],
        signals: ['timer-west', 'ferry'],
        blind: 'none',
        onlyTasks: ['pick cell-core', 'insert socket-reliquary', 'board ferry', 'pick crate-relic', 'drop-on plate-crown', 'press timer-west', 'press timer-east'],
      },
    },
    plan: {
      echoes: [
        ['pick cell-core', 'insert socket-reliquary'],
        ['board ferry', 'when ferry=off pick crate-relic', 'drop-on plate-crown', 'press timer-west'],
        ['press timer-east', 'when timer-west=on press timer-east'],
      ],
    },
    teaching: usesBlindEcho,
    notes: 'Search space too large for an exhaustive 2-echo proof in one run; results are budget-limited evidence.',
  },
};

export function analysisFor(level: LevelDefinition): LevelAnalysisConfig {
  const c = LEVEL_ANALYSIS[level.id];
  if (!c) throw new Error(`no solver analysis config for ${level.id}`);
  return c;
}
