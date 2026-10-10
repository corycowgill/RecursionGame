import {
  ENTITY_KINDS,
  TILE_LEGEND,
  type LevelDefinition,
} from '../../engine/contracts';

export interface LevelIssue {
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Static structural validation of a LevelDefinition (no simulation). Solution verification lives in
 * src/testing/harness (verifyLevelSolution). Level designers may extend this with richer checks.
 */
export function validateLevel(level: LevelDefinition): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const err = (message: string): void => void issues.push({ severity: 'error', message });
  const warn = (message: string): void => void issues.push({ severity: 'warning', message });
  const { width, height, tiles, heights } = level.grid;

  if (!level.id) err('missing id');
  if (tiles.length !== height) err(`grid.tiles has ${tiles.length} rows, expected ${height}`);
  tiles.forEach((row, r) => {
    if (row.length !== width) err(`grid.tiles row ${r} has ${row.length} chars, expected ${width}`);
    for (const ch of row) if (!TILE_LEGEND[ch]) err(`unknown tile char '${ch}' in row ${r}`);
  });
  if (heights) {
    if (heights.length !== height) err(`grid.heights has ${heights.length} rows, expected ${height}`);
    heights.forEach((row, r) => {
      if (row.length !== width) err(`grid.heights row ${r} has ${row.length} chars`);
      if (!/^[0-9]*$/.test(row)) err(`grid.heights row ${r} must be digits`);
    });
  }
  const tileAt = (c: number, r: number): string => tiles[r]?.[c] ?? ' ';
  const walkable = (c: number, r: number): boolean => {
    const t = TILE_LEGEND[tileAt(c, r)];
    return t !== undefined && (t.kind === 'floor' || t.kind === 'ramp');
  };

  const ids = new Set<string>();
  for (const e of level.entities) {
    if (ids.has(e.id)) err(`duplicate entity id '${e.id}'`);
    ids.add(e.id);
    if (!(ENTITY_KINDS as readonly string[]).includes(e.kind)) err(`entity '${e.id}' has unknown kind '${e.kind}'`);
    if (e.col < 0 || e.row < 0 || e.col >= width || e.row >= height) err(`entity '${e.id}' out of bounds`);
    if (e.kind !== 'elevator' && e.kind !== 'movingPlatform' && !walkable(e.col, e.row))
      warn(`entity '${e.id}' sits on a non-walkable tile '${tileAt(e.col, e.row)}'`);
  }
  for (const w of level.wires) {
    if (!ids.has(w.from)) err(`wire from unknown entity '${w.from}'`);
    if (!ids.has(w.to)) err(`wire to unknown entity '${w.to}'`);
  }
  const exit = level.entities.find((e) => e.id === level.exitId);
  if (!exit) err(`exitId '${level.exitId}' not found`);
  else if (exit.kind !== 'exitPortal') err(`exitId '${level.exitId}' is not an exitPortal`);
  if (!walkable(level.playerSpawn.col, level.playerSpawn.row)) err('player spawn is not walkable');
  if (level.maxEchoes < 0 || !Number.isInteger(level.maxEchoes)) err('maxEchoes must be a non-negative integer');
  if (level.loopDurationTicks <= 0 || !Number.isInteger(level.loopDurationTicks)) err('loopDurationTicks must be > 0');
  if (level.solution.length === 0) err('solution is empty');
  if (level.solution.length - 1 > level.maxEchoes) err('solution uses more echoes than maxEchoes');
  try {
    JSON.parse(JSON.stringify(level));
  } catch {
    err('level is not JSON-serializable');
  }
  return issues;
}
