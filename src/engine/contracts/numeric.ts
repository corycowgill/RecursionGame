/**
 * NUMERIC CONVENTION (contract) — all simulation code uses integer fixed-point "units".
 *
 *  - 1 tile (grid cell) edge = UNITS_PER_TILE = 1000 units (milli-tiles). Renderers convert with
 *    `unitsToWorld` (1 tile = WORLD_METRES_PER_TILE Three.js metres). Height levels use the same scale.
 *  - 1 height level = UNITS_PER_LEVEL = 1000 units. Floors at height level h have surface y = h * 1000.
 *  - Axes (matches Three.js so renderers never swap): x = east (+), y = up (+), z = south (+, "down" on a
 *    north-up map). Grid cell (col,row) spans x in [col*1000, col*1000+1000), z in [row*1000, row*1000+1000).
 *  - Time is measured in integer ticks at SIM_HZ = 60. Never use seconds inside the simulation.
 *  - Every value stored in SimState is an integer, boolean, string, null, or plain array/object of those.
 *    Division must go through `idiv` (truncates toward zero). No Math.random, Date, performance.now, floats
 *    accumulated across ticks, or iteration over unordered collections without sorting.
 */

export const SIM_HZ = 60;
export const TICK_MS = 1000 / SIM_HZ; // render-side only (accumulator); never used in sim math
export const UNITS_PER_TILE = 1000;
export const HALF_TILE = 500;
export const UNITS_PER_LEVEL = 1000;
/** Rendering scale: world metres for one tile. Renderers: metres = units / UNITS_PER_TILE * WORLD_METRES_PER_TILE. */
export const WORLD_METRES_PER_TILE = 2;

/** Integer 2D vector (planar, x/z) in units. */
export interface Vec2i {
  x: number;
  z: number;
}

/** Integer 3D vector in units. y is up. */
export interface Vec3i {
  x: number;
  y: number;
  z: number;
}

/** Grid coordinate. */
export interface Cell {
  col: number;
  row: number;
}

/** Cardinal directions. 0 = north (-z), 1 = east (+x), 2 = south (+z), 3 = west (-x). */
export type Dir4 = 0 | 1 | 2 | 3;
export const DIR4_NORTH: Dir4 = 0;
export const DIR4_EAST: Dir4 = 1;
export const DIR4_SOUTH: Dir4 = 2;
export const DIR4_WEST: Dir4 = 3;
export const DIR4_DX: readonly number[] = [0, 1, 0, -1];
export const DIR4_DZ: readonly number[] = [-1, 0, 1, 0];

/** 8-way heading for visuals: 0 = N, 1 = NE, 2 = E, ... 7 = NW (clockwise seen from above). */
export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Integer division truncating toward zero (the only division allowed in sim code). */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Floor division (for cell lookup of possibly negative coordinates). */
export function fdiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function signInt(v: number): -1 | 0 | 1 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function absInt(v: number): number {
  return v < 0 ? -v : v;
}

/** Cell containing a planar unit position. */
export function cellOf(x: number, z: number): Cell {
  return { col: fdiv(x, UNITS_PER_TILE), row: fdiv(z, UNITS_PER_TILE) };
}

/** Unit-space centre of a cell. */
export function cellCenter(col: number, row: number): Vec2i {
  return { x: col * UNITS_PER_TILE + HALF_TILE, z: row * UNITS_PER_TILE + HALF_TILE };
}

export function levelToUnits(level: number): number {
  return level * UNITS_PER_LEVEL;
}

/** Render-side conversion: sim units -> Three.js world metres. Never call from sim code. */
export function unitsToWorld(units: number): number {
  return (units / UNITS_PER_TILE) * WORLD_METRES_PER_TILE;
}

/** Render-side conversion: ticks -> seconds. */
export function ticksToSeconds(ticks: number): number {
  return ticks / SIM_HZ;
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * SIM_HZ);
}

/** Heading (Dir8) from an integer planar move vector; returns null for (0,0). */
export function dir8FromMove(mx: number, mz: number): Dir8 | null {
  const sx = signInt(mx);
  const sz = signInt(mz);
  if (sx === 0 && sz === 0) return null;
  // table indexed by (sz+1)*3 + (sx+1)
  const table: (Dir8 | null)[] = [7, 0, 1, 6, null, 2, 5, 4, 3];
  return table[(sz + 1) * 3 + (sx + 1)] ?? null;
}

/** Dir4 for a Dir8 heading (diagonals resolve toward east/west, documented tie-break). */
export function dir4FromDir8(d: Dir8): Dir4 {
  switch (d) {
    case 0:
      return 0;
    case 1:
    case 2:
    case 3:
      return 1;
    case 4:
      return 2;
    default:
      return 3;
  }
}
