import {
  HALF_TILE,
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorState,
  type EntityId,
  type LevelRuntime,
  type SimState,
} from '../contracts';
import { buildSurfaceOverrides, cellSurfaceAtPoint, surfaceAt, type SurfaceOverrides } from './terrain';

/**
 * COLLISION MODEL (deterministic, integer, axis-separated)
 *  - Actors are square footprints of half-size PHYS.ACTOR_HALF and height PHYS.ACTOR_HEIGHT.
 *  - Movement is resolved X first, then Z. Along each axis the actor moves the full delta unless the new
 *    footprint would overlap a blocker, in which case it stops flush against the nearest blocker edge.
 *  - Terrain blockers: a cell blocks when it has no surface (wall/pillar/railing/void) or when its surface
 *    height, sampled at the point of the cell nearest the actor's centre, differs from the actor's y by more
 *    than PHYS.STEP_TOLERANCE (ledges; ramps are entered from their low/high edges).
 *  - Entity blockers: entities whose behaviour reports isSolid (or isSolidFor(actor) when defined). Footprint = carriable ? CRATE_HALF square
 *    around the entity : full cell square. Vertical extent [y, y + height] must overlap the actor's.
 *  - Blockers already overlapping the actor before the move are ignored (lets actors escape if an elevator or
 *    door ever ends up overlapping them; never used to pass through walls since those are never overlapped).
 *    Exceptions for already-overlapped terrain cells: the actor's CENTRE may only cross into one under the normal
 *    entry rule (no stepping off a ramp's side onto a far lower floor or a pit), and a move that raises the cell's
 *    surface (sampled at the candidate centre) further above the step tolerance is blocked (no sliding into a
 *    ramp's side wall).
 *  - Actors never collide with other actors (echoes and the player pass through each other). This keeps
 *    replays robust: an echo is never shoved off its recorded path by a body.
 */

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  entityId: EntityId;
  /** Optional per-actor filter (behaviour.isSolidFor). */
  blocks?: (actor: ActorState) => boolean;
}

export interface CollisionWorld {
  readonly rt: LevelRuntime;
  readonly overrides: SurfaceOverrides;
  readonly solids: readonly Box[];
}

const SOLID_HEIGHT_CELL = 2000;

export function buildCollisionWorld(rt: LevelRuntime, state: SimState): CollisionWorld {
  const solids: Box[] = [];
  for (const id of rt.entityOrder) {
    const e = state.entities[id];
    if (!e || e.carriedBy !== null) continue;
    const b = rt.behaviourFor(e.kind);
    const def = rt.def(id);
    if (b.isSolidFor) {
      const isSolidFor = b.isSolidFor;
      const box = entityBox(e.x, e.y, e.z, b.carriable === true, id);
      box.blocks = (actor) => isSolidFor(e, def, actor);
      solids.push(box);
      continue;
    }
    if (!b.isSolid || !b.isSolid(e, def)) continue;
    solids.push(entityBox(e.x, e.y, e.z, b.carriable === true, id));
  }
  return { rt, overrides: buildSurfaceOverrides(rt, state), solids };
}

export function entityBox(x: number, y: number, z: number, carriable: boolean, entityId: EntityId): Box {
  if (carriable) {
    const h = PHYS.CRATE_HALF;
    return { minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h, minY: y, maxY: y + PHYS.CRATE_HEIGHT, entityId };
  }
  const col = fdiv(x, UNITS_PER_TILE);
  const row = fdiv(z, UNITS_PER_TILE);
  return {
    minX: col * UNITS_PER_TILE,
    maxX: col * UNITS_PER_TILE + UNITS_PER_TILE,
    minZ: row * UNITS_PER_TILE,
    maxZ: row * UNITS_PER_TILE + UNITS_PER_TILE,
    minY: y,
    maxY: y + SOLID_HEIGHT_CELL,
    entityId,
  };
}

function overlaps1(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}

/** True if a cell blocks an actor standing at height y whose centre is (cx, cz). */
export function cellBlocks(world: CollisionWorld, col: number, row: number, cx: number, cz: number, y: number): boolean {
  const s = cellSurfaceAtPoint(world.rt, world.overrides, col, row, cx, cz);
  if (s === null) return true;
  const d = s - y;
  return d > PHYS.STEP_TOLERANCE || d < -PHYS.STEP_TOLERANCE;
}

/**
 * Moves `actor` along one axis by `delta` units with collision. Mutates actor.x / actor.z.
 * Returns the displacement actually applied.
 */
export function moveAxis(world: CollisionWorld, actor: ActorState, axis: 'x' | 'z', delta: number): number {
  if (delta === 0) return 0;
  const H = PHYS.ACTOR_HALF;
  const ox = actor.x;
  const oz = actor.z;
  const y = actor.y;
  let target = axis === 'x' ? ox + delta : oz + delta;
  const origin = axis === 'x' ? ox : oz;

  // Original footprint.
  const oMinX = ox - H;
  const oMaxX = ox + H;
  const oMinZ = oz - H;
  const oMaxZ = oz + H;
  // Candidate footprint.
  const cx = axis === 'x' ? target : ox;
  const cz = axis === 'z' ? target : oz;
  const cMinX = cx - H;
  const cMaxX = cx + H;
  const cMinZ = cz - H;
  const cMaxZ = cz + H;

  const clampTo = (bMin: number, bMax: number): void => {
    if (delta > 0) {
      const limit = bMin - H;
      if (limit < target) target = limit < origin ? origin : limit;
    } else {
      const limit = bMax + H;
      if (limit > target) target = limit > origin ? origin : limit;
    }
  };

  // Terrain cells overlapped by the candidate footprint.
  const col0 = fdiv(cMinX, UNITS_PER_TILE);
  const col1 = fdiv(cMaxX - 1, UNITS_PER_TILE);
  const row0 = fdiv(cMinZ, UNITS_PER_TILE);
  const row1 = fdiv(cMaxZ - 1, UNITS_PER_TILE);
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const bx0 = col * UNITS_PER_TILE;
      const bz0 = row * UNITS_PER_TILE;
      const bx1 = bx0 + UNITS_PER_TILE;
      const bz1 = bz0 + UNITS_PER_TILE;
      if (overlaps1(oMinX, oMaxX, bx0, bx1) && overlaps1(oMinZ, oMaxZ, bz0, bz1)) {
        // Already overlapping (e.g. walking beside a ramp). QA fuzz findings:
        const sNew = cellSurfaceAtPoint(world.rt, world.overrides, col, row, cx, cz);
        const centreEnters =
          fdiv(cx, UNITS_PER_TILE) === col && fdiv(cz, UNITS_PER_TILE) === row && !(fdiv(ox, UNITS_PER_TILE) === col && fdiv(oz, UNITS_PER_TILE) === row);
        if (centreEnters) {
          // (a) the centre may only cross into the cell under the normal entry rule: no stepping off a ramp's side
          //     onto a floor far below (or onto a pit), no climbing. Stop with the centre just short of the cell.
          if (sNew !== null && sNew - y <= PHYS.STEP_TOLERANCE && y - sNew <= PHYS.STEP_TOLERANCE) continue;
          if (axis === 'x') target = delta > 0 ? Math.min(target, bx0 - 1) : Math.max(target, bx1);
          else target = delta > 0 ? Math.min(target, bz0 - 1) : Math.max(target, bz1);
          continue;
        }
        // (b) otherwise only block a move that pushes the body deeper into terrain rising above the step tolerance,
        //     so actors cannot slide into a ramp's side wall.
        if (sNew === null || sNew - y <= PHYS.STEP_TOLERANCE) continue;
        const sOld = cellSurfaceAtPoint(world.rt, world.overrides, col, row, ox, oz);
        if (sOld !== null && sNew <= sOld) continue;
      } else if (!cellBlocks(world, col, row, cx, cz, y)) continue;
      if (axis === 'x') clampTo(bx0, bx1);
      else clampTo(bz0, bz1);
    }
  }

  // Entity solids.
  const aMinY = y;
  const aMaxY = y + PHYS.ACTOR_HEIGHT;
  for (const b of world.solids) {
    if (!overlaps1(aMinY, aMaxY, b.minY, b.maxY)) continue;
    if (b.blocks && !b.blocks(actor)) continue;
    if (!(overlaps1(cMinX, cMaxX, b.minX, b.maxX) && overlaps1(cMinZ, cMaxZ, b.minZ, b.maxZ))) continue;
    if (overlaps1(oMinX, oMaxX, b.minX, b.maxX) && overlaps1(oMinZ, oMaxZ, b.minZ, b.maxZ)) continue;
    if (axis === 'x') clampTo(b.minX, b.maxX);
    else clampTo(b.minZ, b.maxZ);
  }

  if (axis === 'x') actor.x = target;
  else actor.z = target;
  return target - origin;
}

/** Re-seats the actor on the surface under its centre (no-op if none, e.g. transiently over a void). */
export function settleOnSurface(world: CollisionWorld, actor: ActorState): void {
  const s = surfaceAt(world.rt, world.overrides, actor.x, actor.z);
  if (s !== null) actor.y = s;
}

/** True if an axis-aligned square footprint (half-size `half`) centred at (x,z) overlaps the actor. */
export function footprintOverlapsActor(actor: ActorState, x: number, z: number, half: number): boolean {
  const H = PHYS.ACTOR_HALF;
  return overlaps1(actor.x - H, actor.x + H, x - half, x + half) && overlaps1(actor.z - H, actor.z + H, z - half, z + half);
}

/** True if the actor's footprint overlaps the given cell square. */
export function actorOverlapsCell(actor: ActorState, col: number, row: number): boolean {
  return footprintOverlapsActor(actor, col * UNITS_PER_TILE + HALF_TILE, row * UNITS_PER_TILE + HALF_TILE, HALF_TILE);
}
