import {
  DIR4_DX,
  DIR4_DZ,
  PHYS,
  UNITS_PER_TILE,
  cellOf,
  unitsToWorld,
  type ActorView,
  type EntityDefinition,
  type EntityView,
  type SimView,
  type Timeline,
} from '../../engine/contracts';

/**
 * Head look-target selection (render-only; never feeds back into the simulation).
 *
 * Priority:
 *  1. **The interactable the actor is actually targeting**: the sim's own candidate order (contracts §7) — uncarried
 *     entities anchored in the probe cell (centre + facing × PHYS.REACH), then in the actor's own cell, within one
 *     height level — filtered to what E would act on right now (empty-handed: crates, loose energy cells, timed
 *     switches, sockets holding a cell, cycle-mode lifts; carrying an energy cell: an empty socket).
 *  2. **The next echo-intent target** while the actor stands idle near one: the soonest upcoming planned interaction
 *     (within the badge lookahead) of any shown echo — of its own track for an echo — whose object is within
 *     IDLE_NEAR_TILES. These are the same objects the in-world intent badges mark.
 *  3. Otherwise null: ActorVisual falls back to the faced cell.
 */

/** Same lookahead as the echo-intent badges (4 s). */
export const LOOK_LOOKAHEAD_TICKS = 240;
/** How close (tiles, horizontal) an idle actor must be to an echo-intent target to glance at it. */
export const IDLE_NEAR_TILES = 3.5;

export type LookReason = 'targeted' | 'echoIntent';

export interface LookTarget {
  entityId: string;
  reason: LookReason;
  /** World-space point (metres) the head should turn toward. */
  x: number;
  y: number;
  z: number;
}

/** Height (metres above the entity's base) of the part worth looking at. */
const LOOK_HEIGHT: Partial<Record<EntityView['kind'], number>> = {
  timedSwitch: 1.35,
  energySocket: 0.85,
  crate: 0.55,
  energyCell: 0.35,
  elevator: 0.1,
  pressurePlate: 0.1,
  laserReceiver: 0.9,
  door: 1.2,
};

type DefLookup = (id: string) => EntityDefinition | undefined;

function isTargetable(e: EntityView, actor: ActorView, state: SimView, defOf: DefLookup): boolean {
  if (e.carriedBy !== null) return false;
  const carrying = actor.carrying !== null ? state.entities[actor.carrying] : undefined;
  if (carrying) {
    // carrying: only something that would accept the item (socket ← cell); otherwise E drops (faced cell fallback)
    if (e.kind === 'energySocket' && carrying.kind === 'energyCell') return (e as EntityView<'energySocket'>).state.cellId === null;
    return false;
  }
  switch (e.kind) {
    case 'crate':
      return true;
    case 'energyCell':
      return (e as EntityView<'energyCell'>).state.socketId === null;
    case 'timedSwitch':
      return true;
    case 'energySocket':
      return (e as EntityView<'energySocket'>).state.cellId !== null;
    case 'elevator': {
      const def = defOf(e.id);
      return def?.kind === 'elevator' && def.config.mode === 'cycle';
    }
    default:
      return false;
  }
}

function toTarget(e: EntityView, reason: LookReason): LookTarget {
  return {
    entityId: e.id,
    reason,
    x: unitsToWorld(e.x),
    y: unitsToWorld(e.y) + (LOOK_HEIGHT[e.kind] ?? 0.5),
    z: unitsToWorld(e.z),
  };
}

/** Entity ids in a stable (code-unit) order, like runtime.entityOrder. */
function sortedIds(state: SimView): string[] {
  return Object.keys(state.entities).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Priority 1: what E would act on right now, or null. */
export function targetedInteractable(state: SimView, actor: ActorView, defOf: DefLookup = () => undefined, ids: readonly string[] = sortedIds(state)): EntityView | null {
  const probe = cellOf(actor.x + (DIR4_DX[actor.facing] ?? 0) * PHYS.REACH, actor.z + (DIR4_DZ[actor.facing] ?? 0) * PHYS.REACH);
  const own = cellOf(actor.x, actor.z);
  for (const cell of [probe, own]) {
    for (const id of ids) {
      const e = state.entities[id] as EntityView | undefined;
      if (!e) continue;
      const c = cellOf(e.x, e.z);
      if (c.col !== cell.col || c.row !== cell.row) continue;
      const dy = e.y - actor.y;
      if (dy >= UNITS_PER_TILE || dy <= -UNITS_PER_TILE) continue;
      if (isTargetable(e, actor, state, defOf)) return e;
    }
  }
  return null;
}

/** Priority 2: the soonest upcoming echo-intent target near an idle actor, or null. */
export function nextEchoIntentTarget(state: SimView, actor: ActorView, timeline: Timeline | null): EntityView | null {
  if (!timeline) return null;
  const now = state.tick;
  const shown = new Set<string>(state.actors.map((a) => a.id));
  const near = IDLE_NEAR_TILES * UNITS_PER_TILE;
  let best: EntityView | null = null;
  let bestTick = Infinity;
  let bestDist = Infinity;
  for (const track of timeline.tracks) {
    if (track.kind !== 'echo' || !shown.has(track.actorId)) continue;
    if (actor.kind === 'echo' && track.actorId !== actor.id) continue;
    const m = track.planned.find((x) => x.entityId !== null && x.tick >= now && x.tick - now <= LOOK_LOOKAHEAD_TICKS);
    if (!m || m.entityId === null) continue;
    const e = state.entities[m.entityId] as EntityView | undefined;
    if (!e) continue;
    const ex = e.carriedBy !== null ? state.actors.find((a) => a.id === e.carriedBy) ?? e : e;
    const d = Math.hypot(ex.x - actor.x, ex.z - actor.z);
    if (d > near) continue;
    if (m.tick < bestTick || (m.tick === bestTick && d < bestDist)) {
      best = e;
      bestTick = m.tick;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Where should this actor's head look? See the module doc for the priority order. `defOf` resolves authored
 * entity definitions (only needed to tell cycle-mode lifts apart); `timeline` feeds the echo-intent fallback.
 */
export function selectLookTarget(state: SimView, actor: ActorView, timeline: Timeline | null, defOf: DefLookup = () => undefined): LookTarget | null {
  const targeted = targetedInteractable(state, actor, defOf);
  if (targeted) return toTarget(targeted, 'targeted');
  if (actor.moving) return null;
  const intent = nextEchoIntentTarget(state, actor, timeline);
  if (!intent || intent.id === actor.carrying) return null;
  if (intent.carriedBy !== null) {
    const carrier = state.actors.find((a) => a.id === intent.carriedBy);
    if (!carrier || carrier.id === actor.id) return null;
    return { entityId: intent.id, reason: 'echoIntent', x: unitsToWorld(carrier.x), y: unitsToWorld(carrier.y) + 1.0, z: unitsToWorld(carrier.z) };
  }
  return toTarget(intent, 'echoIntent');
}
