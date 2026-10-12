import {
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorClass,
  type AnySimEntity,
  type EntityId,
  type EntityKind,
  type LevelRuntime,
  type SimContext,
  type SimEntity,
} from '../../engine/contracts';

/**
 * Shared helpers for entity behaviours. Everything here is a pure, deterministic function of the level runtime
 * and the current SimState (stable iteration through `runtime.entityOrder`, integer math only).
 */

/** Grid cell an entity is anchored in. */
export function entityCell(e: { x: number; z: number }): { col: number; row: number } {
  return { col: fdiv(e.x, UNITS_PER_TILE), row: fdiv(e.z, UNITS_PER_TILE) };
}

/** Clamp a delta to +-max (integers). */
export function clampStep(delta: number, max: number): number {
  return delta > max ? max : delta < -max ? -max : delta;
}

/** Saturating tick counter (keeps hashes bounded on very long passes). */
export function bump(v: number | undefined, cap = 1_000_000): number {
  const n = (v ?? 0) + 1;
  return n > cap ? cap : n;
}

const providerCache = new WeakMap<LevelRuntime, readonly EntityId[]>();

/** Ids (in canonical order) of entities whose kind provides walk surfaces (elevators, moving platforms). */
export function surfaceProviderIds(rt: LevelRuntime): readonly EntityId[] {
  let ids = providerCache.get(rt);
  if (!ids) {
    ids = rt.entityOrder.filter((id) => rt.behaviourFor(rt.def(id).kind).surfaceCells !== undefined);
    providerCache.set(rt, ids);
  }
  return ids;
}

/**
 * The surface-providing entity whose surface covers the point (x,z) of cell (col,row) within STEP_TOLERANCE of
 * `y`, if any. Mirrors the terrain rule "first override in entity id order covering the point wins" (clipped deck
 * surfaces only cover the deck's real extent).
 */
export function surfaceProviderAt(
  ctx: SimContext,
  col: number,
  row: number,
  y: number,
  x: number = col * UNITS_PER_TILE + 500,
  z: number = row * UNITS_PER_TILE + 500,
): { entity: AnySimEntity; y: number } | null {
  const x0 = col * UNITS_PER_TILE;
  const z0 = row * UNITS_PER_TILE;
  const px = x < x0 ? x0 : x > x0 + UNITS_PER_TILE - 1 ? x0 + UNITS_PER_TILE - 1 : x;
  const pz = z < z0 ? z0 : z > z0 + UNITS_PER_TILE - 1 ? z0 + UNITS_PER_TILE - 1 : z;
  const rt = ctx.runtime;
  for (const id of surfaceProviderIds(rt)) {
    const e = ctx.state.entities[id];
    if (!e) continue;
    const b = rt.behaviourFor(e.kind);
    if (!b.surfaceCells) continue;
    for (const sc of b.surfaceCells(e, rt.def(id))) {
      if (sc.col !== col || sc.row !== row) continue;
      const c = sc.clip;
      if (c && !(px >= c.minX && px < c.maxX && pz >= c.minZ && pz < c.maxZ)) continue;
      const d = sc.y - y;
      // The first provider covering the cell owns it (terrain rule); report it only if the item rests on it.
      return d <= PHYS.STEP_TOLERANCE && d >= -PHYS.STEP_TOLERANCE ? { entity: e, y: sc.y } : null;
    }
  }
  return null;
}

/**
 * Resting carriable items (crates, energy cells) ride the surface they rest on: they follow an elevator's height
 * and are carried along by a moving platform's planar delta. Items only mutate their own position.
 *
 * Ordering note: if the provider updates later in id order than the item, the item applies the provider's delta
 * from the previous tick (one tick of lag); the total displacement is identical either way.
 */
export function rideSurface<K extends EntityKind>(ctx: SimContext, item: SimEntity<K>): void {
  if (item.carriedBy !== null) return;
  if (surfaceProviderIds(ctx.runtime).length === 0) return;
  const { col, row } = entityCell(item);
  const p = surfaceProviderAt(ctx, col, row, item.y, item.x, item.z);
  if (!p) return;
  const b = ctx.runtime.behaviourFor(p.entity.kind);
  const d = b.carrierDelta ? b.carrierDelta(p.entity) : null;
  if (d) {
    item.x += d.dx;
    item.z += d.dz;
  }
  item.y = p.y;
}

/** The energy socket currently holding `cellId`, or null. Authoritative (reads socket state directly). */
export function socketHolding(ctx: SimContext, cellId: EntityId): EntityId | null {
  for (const id of ctx.runtime.entityOrder) {
    const e = ctx.state.entities[id];
    if (e && e.kind === 'energySocket' && e.state.cellId === cellId) return id;
  }
  return null;
}

/**
 * (round 6, Attuned Devices) Actor class membership: 'player' = the live actor, 'echoes' = every echo (nested-loop copies
 * included: they are echoes), 'all' / undefined = anyone.
 */
export function actorMatchesClass(actor: { kind: 'player' | 'echo' }, cls: ActorClass | undefined): boolean {
  if (cls === undefined || cls === 'all') return true;
  return cls === 'player' ? actor.kind === 'player' : actor.kind === 'echo';
}
