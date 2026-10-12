import { UNITS_PER_TILE, type LevelDefinition } from '../../engine/contracts';
import { NavGraph } from './navigation';
import type { SearchBounds } from './search';
import { attunedDivergences, endsDownstream, noShatter, relayBypassed, relayUsed } from './teaching';
import type { VerifiedSolution } from './verify';
import type { LevelAnalysisConfig } from './levelConfigs';

/**
 * SOLVER CONFIGS FOR THE ROUND-6 "B" CHAMBERS (level designer B: keys and combination track):
 * L14 Gold and Cyan, L15 Glass Gallery, L17 Upstream, L18 Hour of Glass. Same conventions as LEVEL_ANALYSIS in
 * levelConfigs.ts (looked up by `analysisFor`); kept in a separate file so the two round-6 designers never edit the same
 * table. This file imports only teaching.ts (no import cycle with levelConfigs.ts).
 * Results and bounds are documented in docs/game-design/levels-round6-B.md.
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

/**
 * At least `n` intended 'attuned' divergences (Echo Console: recorded fail, replayed use). "At least": pressing the
 * console twice is the same lesson; the level tests assert the authored solution's exact count.
 */
export function attuned(n: number): Teach {
  return (v) => {
    const d = attunedDivergences(v);
    return d >= n ? null : `${d} attuned divergence(s), expected at least ${n}`;
  };
}

/** No Paradox Glass device shattered in the winning pass. */
export const glassIntact: Teach = (v) => (noShatter(v) ? null : 'a Paradox Glass device shattered');

/** The relay's delayed output outlived its input, and its input was not simply held through the delay. */
export function relayMatters(relayId: string): Teach {
  return (v, level) => {
    if (!relayUsed(level, v, relayId)) return `the ${relayId} output was never on while its input was off`;
    const held = relayBypassed(level, v, relayId);
    return held === null ? null : `relay-bypass: ${relayId} input held from tick ${held} to the win`;
  };
}

/** Some actor matching `who` ends downstream of the valve (it committed through the one-way door). */
export function downstream(valveId: string, who: (a: { id: string; kind: string; recursion?: number }) => boolean, label: string): Teach {
  return (v, level) => (endsDownstream(level, v, valveId, who) ? null : `no ${label} ends downstream of ${valveId}`);
}

/** No actor matching `who` ends downstream of the valve. */
export function notDownstream(valveId: string, who: (a: { id: string; kind: string; recursion?: number }) => boolean, label: string): Teach {
  return (v, level) => (endsDownstream(level, v, valveId, who) ? `${label} ends downstream of ${valveId}` : null);
}

/**
 * The valve's downstream region for a level that also has a lift: flood fill over the static walkable grid from the
 * downstream neighbour, never crossing the valve cell NOR any lift / deck cell (teaching.ts' endsDownstream floods
 * through lift shafts, which in L17 joins the gallery above the valve to the hall below it).
 */
function downstreamCells(level: LevelDefinition, valveId: string): { region: Set<number>; graph: NavGraph } | null {
  const def = level.entities.find((e) => e.id === valveId);
  if (!def || def.kind !== 'checkValve') return null;
  const graph = new NavGraph(level);
  const movers = new Set(level.entities.filter((e) => e.kind === 'elevator' || e.kind === 'movingPlatform').map((e) => graph.cellIndex(e.col, e.row)));
  const f = def.facing ?? 0;
  const dc = f === 1 ? 1 : f === 3 ? -1 : 0;
  const dr = f === 2 ? 1 : f === 0 ? -1 : 0;
  const region = new Set<number>();
  const stack = [{ col: def.col + dc, row: def.row + dr }];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (!graph.passable(c.col, c.row) || (c.col === def.col && c.row === def.row)) continue;
    const k = graph.cellIndex(c.col, c.row);
    if (region.has(k) || movers.has(k)) continue;
    region.add(k);
    stack.push({ col: c.col + 1, row: c.row }, { col: c.col - 1, row: c.row }, { col: c.col, row: c.row + 1 }, { col: c.col, row: c.row - 1 });
  }
  return { region, graph };
}

/**
 * Nested loop + valve (L17 lesson): some recording ends on both sides of the valve, its echo DOWNSTREAM and its
 * recursive copy NOT downstream (the spec's endsDownstream(echo) && !endsDownstream(copy)), with "downstream" as in
 * downstreamCells (lift shafts do not connect the two sides), and the winning pass shows the echo passing the valve and
 * the copy being turned back by it (valvePass / valveDenied), so a copy that merely lags 5 s behind on a plate does not count.
 */
export function splitAcrossValve(valveId: string): Teach {
  return (v, level) => {
    const d = downstreamCells(level, valveId);
    if (!d) return `no valve ${valveId}`;
    const down = (a: { x: number; z: number }) => d.region.has(d.graph.cellIndex(Math.floor(a.x / UNITS_PER_TILE), Math.floor(a.z / UNITS_PER_TILE)));
    const actors = v.finalState.actors;
    for (const e of actors) {
      if (e.kind !== 'echo' || e.recursion !== undefined) continue;
      const copies = actors.filter((a) => a.kind === 'echo' && a.recursion !== undefined && a.loopId === e.loopId);
      if (copies.length === 0 || !down(e) || copies.some((c) => down(c))) continue;
      // ... and it is the valve that kept them apart: the echo passed it, a copy was turned back by it.
      const passed = v.events.some((x) => x.type === 'entity' && x.name === 'valvePass' && x.entityId === valveId && x.actorId === e.id);
      const denied = v.events.some((x) => x.type === 'entity' && x.name === 'valveDenied' && x.entityId === valveId && copies.some((c) => c.id === x.actorId));
      if (passed && denied) return null;
    }
    return `no recording ends with its echo downstream of ${valveId} (passed) and its copy upstream (turned back by the valve)`;
  };
}

/** L18: the beam cell as an extra drop target / stand cell. */
const BEAM: NonNullable<Bounds['vocab']> = { extraDrops: [{ col: 20, row: 1 }], extraCells: [{ col: 20, row: 1 }] };

export const ROUND6_B_ANALYSIS: Record<string, LevelAnalysisConfig> = {
  'L14-gold-and-cyan': {
    intended: 1,
    proof: [{ echoSteps: 0, finalSteps: 3 }],
    find: { echoSteps: 1, finalSteps: 1 },
    teaching: attuned(1),
    cheese: [{ echoes: 1, echoSteps: 2, finalSteps: 1 }],
    notes: 'k=0 cannot light a cyan console (keys); the cheese hunt looks for 1-echo wins without the attuned fail -> use.',
  },
  'L15-glass-gallery': {
    intended: 2,
    proof: [deep(3), wide(2, ['timer-west', 'timer-east', 'door-cyan'])],
    find: {
      echoSteps: 2,
      finalSteps: 1,
      vocab: {
        fixedWaits: [],
        signals: ['timer-west'],
        blind: 'none',
        onlyTasks: ['stand plate-echo ~glass', 'press timer-west', 'press timer-west ~glass', 'press timer-east ~glass', 'stand seal-glass'],
      },
    },
    teaching: glassIntact,
    // Shortest routes (across the glass) and glass-avoiding routes are both in the vocabulary: any win must avoid it.
    cheese: [{ echoes: 2, echoSteps: 2, finalSteps: 1, vocab: { fixedWaits: [], signals: ['timer-west'], blind: 'none' } }],
    notes: 'Body count: two timer hands 18 tiles apart, each 9 tiles (3.75 s) from the seal, timers 2.5 s.',
  },
  'L17-upstream': {
    intended: 2,
    proof: [deep(3), wide(2, ['lift'])],
    find: { echoSteps: 3, finalSteps: 0, vocab: { fixedWaits: [360], signals: ['lift'], blind: 'none', onlyTasks: ['board lift', 'stand plate-foot', 'stand plate-brake', 'stand plate-head'] } },
    plan: { echoes: [['board lift', 'stand plate-head', 'stand plate-foot'], ['when lift=on stand plate-brake']] },
    teaching: splitAcrossValve('valve-chute'),
    cheese: [{ ...deep(2, 0), echoes: 2 }, { ...wide(2, ['lift'], 0), echoes: 2 }],
    notes: 'Body count: Head + Foot + Brake + you = 4 jobs; 1 echo = 3 bodies. Copies replay their echo, so 3 plates need a split pair.',
  },
  'L18-hour-of-glass': {
    intended: 3,
    // The beam cell (20,1) is neither a plate nor a door: it is added as a drop target and a stand cell, so the crate
    // (or a body) can be put in the beam.
    proof: [deep(2, 1, BEAM), { echoSteps: 1, finalSteps: 1, vocab: { ...BEAM, signals: ['relay-hour', 'door-lens'] } }],
    find: {
      echoSteps: 3,
      finalSteps: 0,
      vocab: {
        ...BEAM,
        fixedWaits: [],
        signals: ['relay-hour'],
        blind: 'none',
        onlyTasks: ['pick crate-hour ~glass', 'drop-at 20,1 ~glass', 'press console-echo ~glass', 'stand plate-echo ~glass', 'press timer-crown ~glass'],
      },
    },
    plan: {
      echoes: [
        ['pick crate-hour ~glass', 'drop-at 20,1 ~glass', 'press console-echo ~glass'],
        ['stand plate-echo ~glass'],
        ['press timer-crown ~glass', 'when relay-hour=on press timer-crown ~glass'],
      ],
    },
    teaching: all(attuned(1), glassIntact, relayMatters('relay-hour'), downstream('valve-sump', (a) => a.kind === 'echo', 'echo')),
    notes: 'Body count + keys + valve: seal (you), Echo Plate (an echo), timer (7 s from the seal), console 8 s earlier from inside the Sump. k=2 is budget-limited.',
  },
};

export { all as allChecks, deep as deepBounds, wide as wideBounds };
