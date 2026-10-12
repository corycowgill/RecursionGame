import type { LevelDefinition } from '../../engine/contracts';
import type { SearchBounds } from './search';
import { endsDownstream, relayBypassed, relayUsed } from './teaching';
import type { VerifiedSolution } from './verify';
import type { LevelAnalysisConfig } from './levelConfigs';

/**
 * SOLVER CONFIGS FOR THE ROUND-6 "A" CHAMBERS (level designer A: valve and relay track): L11 The Sump, L12 Late Light,
 * L13 Roundabout, L16 Afterimage. Same conventions as LEVEL_ANALYSIS in levelConfigs.ts (looked up by `analysisFor`);
 * kept in a separate file so the two round-6 designers never edit the same table. Imports only teaching.ts at runtime
 * (no import cycle with levelConfigs.ts). Results and bounds: docs/game-design/levels-round6-A.md.
 */

type Bounds = Omit<SearchBounds, 'echoes'>;
type Teach = (v: VerifiedSolution, level: LevelDefinition) => string | null;

/** DEEP bounds: up to `steps` tasks per echo, no waits, live walking only. */
function deep(steps: number, finalSteps = 1, extra: Bounds['vocab'] = {}): Bounds {
  return { echoSteps: steps, finalSteps, vocab: { fixedWaits: [], signals: [], blind: 'none', ...extra } };
}

/** WIDE bounds: up to `steps` tasks per echo, every wait (1 s / 3 s / relay delays / listed signal edges), blind walking. */
function wide(steps: number, signals?: string[], finalSteps = 1, extra: Bounds['vocab'] = {}): Bounds {
  return { echoSteps: steps, finalSteps, vocab: { ...(signals ? { signals } : {}), ...extra } };
}

/** Every check must pass (first violation wins). */
function all(...checks: Teach[]): Teach {
  return (v, level) => {
    for (const c of checks) {
      const r = c(v, level);
      if (r !== null) return r;
    }
    return null;
  };
}

/** The relay's delayed output outlived its input, and its input was not simply held through the delay. */
export function relayMatters(relayId: string): Teach {
  return (v, level) => {
    if (!relayUsed(level, v, relayId)) return `the ${relayId} output was never on while its input was off`;
    const held = relayBypassed(level, v, relayId);
    return held === null ? null : `relay-bypass: ${relayId} input held from tick ${held} to the win`;
  };
}

/** Some echo ends downstream of the valve (it committed through the one-way door). */
export function echoDownstream(valveId: string): Teach {
  return (v, level) => (endsDownstream(level, v, valveId, (a) => a.kind === 'echo') ? null : `no echo ends downstream of ${valveId}`);
}


export const ROUND6_A_ANALYSIS: Record<string, LevelAnalysisConfig> = {
  'L11-the-sump': {
    intended: 1,
    proof: [
      { echoSteps: 0, finalSteps: 4, vocab: { fixedWaits: [], signals: [] } },
      { echoSteps: 0, finalSteps: 3 },
    ],
    find: {
      echoSteps: 2,
      finalSteps: 2,
      vocab: { blind: 'none', fixedWaits: [180, 300], signals: [], onlyTasks: ['stand plate-store', 'stand plate-pump', 'pick crate-store', 'drop-on plate-hall', 'hold'] },
    },
    plan: { echoes: [['stand plate-store', '+300t stand plate-pump']], final: ['pick crate-store', 'drop-on plate-hall'] },
    teaching: echoDownstream('valve-sump'),
    cheese: [{ echoes: 1, echoSteps: 2, finalSteps: 2, vocab: { signals: [] } }],
    notes: 'k=0 is structurally impossible (the Pump Plate is sealed off from the exit); the final-run searches confirm it.',
  },
  'L12-late-light': {
    intended: 1,
    proof: [
      { echoSteps: 0, finalSteps: 3, vocab: { fixedWaits: [], signals: [] } },
      { echoSteps: 0, finalSteps: 2 },
    ],
    find: { echoSteps: 3, finalSteps: 0, vocab: { blind: 'none', fixedWaits: [60], signals: [], onlyTasks: ['press switch-bell', 'stand plate-bell', 'stand plate-lamp'] } },
    plan: { echoes: [['press switch-bell', 'stand plate-bell', '+60t stand plate-lamp']] },
    teaching: relayMatters('relay-bell'),
    cheese: [{ echoes: 1, echoSteps: 3, finalSteps: 0, vocab: { blind: 'none', signals: [] } }],
    notes: 'k=0 is a body count (Lamp Plate holder + you in the doorway); the final-run searches confirm it.',
  },
  'L13-roundabout': {
    intended: 2,
    proof: [deep(2), wide(1, ['timer-north', 'timer-south', 'relay-crown', 'door-crown'])],
    find: {
      echoSteps: 3,
      finalSteps: 0,
      vocab: { blind: 'none', fixedWaits: [600], signals: ['relay-crown'], onlyTasks: ['press timer-north', 'press timer-south', 'hold'] },
    },
    teaching: relayMatters('relay-crown'),
    cheese: [{ ...deep(2, 0), echoes: 2 }],
    notes: 'k=0,1 exhaustive at deep(2) / wide(1). Also run: k=0 deep(3) / wide(2) exhaustive; k=1 deep(3) / wide(2) budget-limited (1200 s, none). Backed by the valve-directed distance argument.',
  },
  'L16-afterimage': {
    intended: 2,
    proof: [deep(2), wide(1, ['door-vault', 'door-spire', 'relay-hall'])],
    find: {
      echoSteps: 2,
      finalSteps: 2,
      vocab: { blind: 'none', fixedWaits: [180, 600], signals: [], onlyTasks: ['stand plate-hall', 'stand plate-reading', 'stand plate-vault', 'hold'] },
    },
    plan: { echoes: [['stand plate-reading'], ['stand plate-hall', '+360t stand plate-vault']], final: ['+600t stand plate-hall'] },
    teaching: all(relayMatters('relay-hall'), echoDownstream('valve-vault')),
    cheese: [{ ...deep(2, 1), echoes: 2 }],
    notes: 'k=0 was also searched at deep(3) and wide(2): exhaustive, none. k=1 deep(3) / wide(2) run out of budget (600 s, none).',
  },
};
