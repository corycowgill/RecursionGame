import { TILE_LEGEND, WORLD_METRES_PER_TILE, type Dir4, type LevelDefinition, type Tile } from '../../engine/contracts';

/** Render-side parsed tile grid (mirrors the engine's parsing of LevelDefinition.grid; read-only data). */
export interface RenderGrid {
  width: number;
  height: number;
  tileAt(col: number, row: number): Tile;
  /** World-space centre of a cell at its tile height. */
  cellCenter(col: number, row: number, level?: number): { x: number; y: number; z: number };
  isWalkable(col: number, row: number): boolean;
  isWall(col: number, row: number): boolean;
  /** Surface height level of a walkable cell (ramps: low end), or -1. */
  floorLevel(col: number, row: number): number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxLevel: number };
}

const VOID: Tile = { kind: 'void', h: 0 };
export const T = WORLD_METRES_PER_TILE;

export function parseGrid(level: LevelDefinition): RenderGrid {
  const { width, height, tiles, heights } = level.grid;
  const cells: Tile[] = [];
  let maxLevel = 0;
  for (let row = 0; row < height; row++) {
    const line = tiles[row] ?? '';
    const hl = heights?.[row] ?? '';
    for (let col = 0; col < width; col++) {
      const ch = line[col] ?? ' ';
      const legend = TILE_LEGEND[ch] ?? { kind: 'void' as const };
      const hch = hl[col];
      const h = hch && hch >= '0' && hch <= '9' ? hch.charCodeAt(0) - 48 : 0;
      maxLevel = Math.max(maxLevel, h + (legend.kind === 'ramp' ? 1 : 0));
      const t: Tile = { kind: legend.kind, h };
      if (legend.dir !== undefined) t.dir = legend.dir as Dir4;
      cells.push(t);
    }
  }
  const tileAt = (col: number, row: number): Tile =>
    col < 0 || row < 0 || col >= width || row >= height ? VOID : (cells[row * width + col] ?? VOID);
  const isWalkable = (col: number, row: number) => {
    const k = tileAt(col, row).kind;
    return k === 'floor' || k === 'ramp';
  };
  const isWall = (col: number, row: number) => tileAt(col, row).kind === 'wall';
  return {
    width,
    height,
    tileAt,
    isWalkable,
    isWall,
    floorLevel: (col, row) => {
      const t = tileAt(col, row);
      return t.kind === 'void' || t.kind === 'wall' ? -1 : t.h;
    },
    cellCenter: (col, row, lvl) => ({ x: (col + 0.5) * T, y: (lvl ?? tileAt(col, row).h) * T, z: (row + 0.5) * T }),
    bounds: { minX: 0, maxX: width * T, minZ: 0, maxZ: height * T, maxLevel },
  };
}
