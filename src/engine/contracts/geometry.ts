import type { Dir4 } from './numeric';

/**
 * Static level geometry. One Tile per grid cell; immutable for the whole level (dynamic things — doors,
 * elevators, platforms — are entities). Renderers build the modular kit from this; physics derives
 * walkability and surface heights from it.
 *
 *  floor   walkable surface at height level `h`.
 *  wall    full-height solid block (wall module / wall section). `h` = base level for rendering.
 *  pillar  solid, rendered as a column (structural accent). Blocks like a wall.
 *  railing solid for movement (waist-high barrier, see-through). Rendered as a railing on a floor at `h`.
 *  ramp    walkable slope from level h (low edge) up to h+1 at the edge facing `dir` (ascending direction).
 *  void    pit / abyss. Not walkable unless an entity provides a surface (elevator, moving platform).
 */
export type TileKind = 'floor' | 'wall' | 'pillar' | 'railing' | 'ramp' | 'void';

export const TILE_KINDS: readonly TileKind[] = ['floor', 'wall', 'pillar', 'railing', 'ramp', 'void'];

export interface Tile {
  kind: TileKind;
  /** Height level (integer >= 0). For ramps, the LOW end level. */
  h: number;
  /** Ramps only: direction of ascent. */
  dir?: Dir4;
}

/**
 * Compact authoring legend for LevelDefinition.grid.tiles (one string per row, one char per cell):
 *   '.' floor   '#' wall   'O' pillar   '=' railing   ' ' or '_' void
 *   '^' '>' 'v' '<'  ramp ascending north / east / south / west
 * Heights come from grid.heights (same shape, digits '0'-'9'; missing = 0).
 */
export const TILE_LEGEND: Readonly<Record<string, { kind: TileKind; dir?: Dir4 }>> = {
  '.': { kind: 'floor' },
  '#': { kind: 'wall' },
  O: { kind: 'pillar' },
  '=': { kind: 'railing' },
  ' ': { kind: 'void' },
  _: { kind: 'void' },
  '^': { kind: 'ramp', dir: 0 },
  '>': { kind: 'ramp', dir: 1 },
  v: { kind: 'ramp', dir: 2 },
  '<': { kind: 'ramp', dir: 3 },
};

export function isSolidTileKind(kind: TileKind): boolean {
  return kind === 'wall' || kind === 'pillar' || kind === 'railing';
}

/**
 * Purely visual decoration placed by level designers (machinery, conduits, rings, windows...). Never read by
 * the simulation. `type` is an open string interpreted by graphics.
 */
export interface DecorDefinition {
  type: string;
  col: number;
  row: number;
  level?: number;
  facing?: Dir4;
  /** Free-form numeric/string params for the renderer (scale, variant, color key...). */
  params?: Record<string, number | string | boolean>;
}
