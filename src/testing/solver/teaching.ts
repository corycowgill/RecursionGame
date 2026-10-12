import { IDLE_INPUT, UNITS_PER_TILE, type LevelDefinition, type SimState } from '../../engine/contracts';
import { NavGraph } from './navigation';
import type { VerifiedSolution } from './verify';
import { SolverWorld } from './world';

/**
 * ROUND-6 TEACHING CHECKS — machine checks that a verified solution actually exercises a new mechanic (used by
 * levelConfigs `teaching` functions and by cheese hunts). Each returns a plain value; levelConfigs turns it into the
 * "null = lesson exercised / string = why it was bypassed" convention.
 */

/** Re-simulates the winning pass of a verified solution, calling `visit` after every tick. */
export function replayWinningPass(level: LevelDefinition, v: VerifiedSolution, visit: (st: SimState) => void): void {
  const w = new SolverWorld(level, v.echoLoops);
  const st = w.initial();
  const end = v.completedAtTick ?? v.finalInputs.length;
  for (let t = 0; t <= end && st.status === 'playing'; t++) {
    w.step(st, v.finalInputs[t] ?? { ...IDLE_INPUT, tick: t });
    visit(st);
  }
}

/** Combined input of a consumer as read from the given signal buffer (same rule as SimContext.inputsPowered). */
export function combinedInput(level: LevelDefinition, signals: Readonly<Record<string, boolean>>, id: string): boolean | null {
  const wires = level.wires.filter((w) => w.to === id);
  if (wires.length === 0) return null;
  const logic = level.entities.find((e) => e.id === id)?.logic ?? 'and';
  const lit = wires.map((w) => (signals[w.from] === true) !== (w.invert === true));
  return logic === 'or' ? lit.some(Boolean) : lit.every(Boolean);
}

/**
 * Chrono relay used: in the winning pass some tick has the relay's output ON while its combined input is OFF, i.e. the
 * delayed signal outlived its cause.
 */
export function relayUsed(level: LevelDefinition, v: VerifiedSolution, relayId: string): boolean {
  let used = false;
  replayWinningPass(level, v, (st) => {
    if (st.signals[relayId] === true && combinedInput(level, st.signals, relayId) === false) used = true;
  });
  return used;
}

/**
 * Relay bypass (cheese kind 'relay-bypass'): the relay's input was held continuously from a tick <= winTick - delayTicks
 * up to the win, so the delay never mattered (brute holding). Returns the tick from which it was held, or null.
 */
export function relayBypassed(level: LevelDefinition, v: VerifiedSolution, relayId: string): number | null {
  const def = level.entities.find((e) => e.id === relayId);
  if (!def || def.kind !== 'chronoRelay') return null;
  let heldFrom: number | null = null;
  let win = -1;
  replayWinningPass(level, v, (st) => {
    const on = combinedInput(level, st.signals, relayId) === true;
    if (!on) heldFrom = null;
    else heldFrom ??= st.tick - 1;
    if (st.status === 'complete') win = st.completedAtTick ?? st.tick - 1;
  });
  return win >= 0 && heldFrom !== null && heldFrom <= win - def.config.delayTicks ? heldFrom : null;
}

/**
 * Check valve: at the win, at least one matching actor's centre is in the valve's DOWNSTREAM region (flood fill over the
 * static walkable grid from the downstream neighbour, never crossing the valve cell).
 */
export function endsDownstream(level: LevelDefinition, v: VerifiedSolution, valveId: string, actorFilter: (a: SimState['actors'][number]) => boolean = () => true): boolean {
  const def = level.entities.find((e) => e.id === valveId);
  if (!def || def.kind !== 'checkValve') return false;
  const g = new NavGraph(level);
  const f = def.facing ?? 0;
  const dc = f === 1 ? 1 : f === 3 ? -1 : 0;
  const dr = f === 2 ? 1 : f === 0 ? -1 : 0;
  const region = new Set<number>();
  const stack = [{ col: def.col + dc, row: def.row + dr }];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (!g.passable(c.col, c.row) || (c.col === def.col && c.row === def.row)) continue;
    const k = g.cellIndex(c.col, c.row);
    if (region.has(k)) continue;
    region.add(k);
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      stack.push({ col: c.col + x, row: c.row + y });
  }
  const st = v.finalState;
  return st.actors.some(
    (a) => actorFilter(a as SimState['actors'][number]) && region.has(g.cellIndex(Math.floor(a.x / UNITS_PER_TILE), Math.floor(a.z / UNITS_PER_TILE))),
  );
}

/** Number of divergences in the winning pass whose RECORDED reason is 'attuned' (the intended Echo Console lesson). */
export function attunedDivergences(v: VerifiedSolution): number {
  return v.events.filter((e) => e.type === 'divergence' && e.expected.reason === 'attuned').length;
}

/** No Paradox Glass device shattered in the winning pass. */
export function noShatter(v: VerifiedSolution): boolean {
  return !v.events.some((e) => e.type === 'entity' && e.name === 'shatter');
}
