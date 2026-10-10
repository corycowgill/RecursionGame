import {
  UNITS_PER_LEVEL,
  UNITS_PER_TILE,
  clampInt,
  fdiv,
  type LevelRuntime,
  type SimState,
  type Tile,
} from '../contracts';

/**
 * TERRAIN MODEL
 * Every cell has a walk-surface height function:
 *   floor     flat at h * 1000
 *   ramp      linear from h*1000 (low edge) to (h+1)*1000 at the edge facing `dir` (1:1 slope)
 *   void/wall/pillar/railing   no surface (null)
 * Entities may override a cell's surface with a flat height (elevator/moving platform). An override may be
 * clipped to part of the cell (SurfaceCell.clip: a moving deck straddling two cells covers only its real 1x1
 * extent); points of the cell outside every clip keep the tile's own surface. Where overrides overlap, the first
 * in entity id order wins. An actor's y always equals the surface height under its centre point.
 */

export interface SurfaceOverride {
  y: number;
  /** Planar clip (half-open, world units); null = the whole cell. */
  clip: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

/** cellKey -> overrides covering (part of) that cell, in entity id order. */
export type SurfaceOverrides = ReadonlyMap<number, readonly SurfaceOverride[]>;

export function cellKey(col: number, row: number): number {
  return (col + 1024) * 4096 + (row + 1024);
}

export function buildSurfaceOverrides(rt: LevelRuntime, state: SimState): Map<number, SurfaceOverride[]> {
  const map = new Map<number, SurfaceOverride[]>();
  for (const id of rt.entityOrder) {
    const e = state.entities[id];
    if (!e) continue;
    const b = rt.behaviourFor(e.kind);
    if (!b.surfaceCells) continue;
    for (const sc of b.surfaceCells(e, rt.def(id))) {
      const k = cellKey(sc.col, sc.row);
      const entry: SurfaceOverride = { y: sc.y, clip: sc.clip ?? null };
      const list = map.get(k);
      if (list) list.push(entry);
      else map.set(k, [entry]);
    }
  }
  return map;
}

/** True when the point (already clamped into its cell) lies inside the override's clip. */
export function overrideCovers(o: SurfaceOverride, x: number, z: number): boolean {
  const c = o.clip;
  return c === null || (x >= c.minX && x < c.maxX && z >= c.minZ && z < c.maxZ);
}

/** The override covering a point of a cell (point clamped into the cell), or null. */
export function overrideAtPoint(overrides: SurfaceOverrides, col: number, row: number, x: number, z: number): SurfaceOverride | null {
  const list = overrides.get(cellKey(col, row));
  if (!list) return null;
  const x0 = col * UNITS_PER_TILE;
  const z0 = row * UNITS_PER_TILE;
  const px = clampInt(x, x0, x0 + UNITS_PER_TILE - 1);
  const pz = clampInt(z, z0, z0 + UNITS_PER_TILE - 1);
  for (const o of list) if (overrideCovers(o, px, pz)) return o;
  return null;
}

/** Surface height of a tile at an arbitrary planar point (clamped into the tile). */
export function tileSurfaceAt(tile: Readonly<Tile>, col: number, row: number, x: number, z: number): number | null {
  if (tile.kind === 'floor') return tile.h * UNITS_PER_LEVEL;
  if (tile.kind !== 'ramp') return null;
  const x0 = col * UNITS_PER_TILE;
  const z0 = row * UNITS_PER_TILE;
  const lx = clampInt(x - x0, 0, UNITS_PER_TILE);
  const lz = clampInt(z - z0, 0, UNITS_PER_TILE);
  let t: number;
  switch (tile.dir ?? 0) {
    case 0:
      t = UNITS_PER_TILE - lz;
      break;
    case 1:
      t = lx;
      break;
    case 2:
      t = lz;
      break;
    default:
      t = UNITS_PER_TILE - lx;
      break;
  }
  // UNITS_PER_TILE === UNITS_PER_LEVEL so the rise equals t (integer, no division).
  return tile.h * UNITS_PER_LEVEL + t;
}

/** Surface at a point within a specific cell (point is clamped into the cell). */
export function cellSurfaceAtPoint(
  rt: LevelRuntime,
  overrides: SurfaceOverrides,
  col: number,
  row: number,
  x: number,
  z: number,
): number | null {
  const o = overrideAtPoint(overrides, col, row, x, z);
  if (o !== null) return o.y;
  return tileSurfaceAt(rt.tileAt(col, row), col, row, x, z);
}

/** Surface under a planar point. */
export function surfaceAt(rt: LevelRuntime, overrides: SurfaceOverrides, x: number, z: number): number | null {
  const col = fdiv(x, UNITS_PER_TILE);
  const row = fdiv(z, UNITS_PER_TILE);
  return cellSurfaceAtPoint(rt, overrides, col, row, x, z);
}

/** Surface at a cell's centre. */
export function cellSurfaceY(rt: LevelRuntime, overrides: SurfaceOverrides, col: number, row: number): number | null {
  return cellSurfaceAtPoint(rt, overrides, col, row, col * UNITS_PER_TILE + 500, row * UNITS_PER_TILE + 500);
}

/**
 * True when the cell is a flat surface at its centre (floor, or an entity override covering the centre) — required
 * for resting (cell-snapped) items.
 */
export function isFlatCell(rt: LevelRuntime, overrides: SurfaceOverrides, col: number, row: number): boolean {
  if (overrideAtPoint(overrides, col, row, col * UNITS_PER_TILE + 500, row * UNITS_PER_TILE + 500) !== null) return true;
  return rt.tileAt(col, row).kind === 'floor';
}
