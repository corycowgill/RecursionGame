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
  validateComponents(level, err, warn, walkable);
  if (level.order > 0) {
    if (!level.subtitle) warn('campaign level has no subtitle');
    if (!level.story || level.story.length === 0) warn('campaign level has no story text');
    if (level.hints.length === 0) warn('campaign level has no hints');
    if (level.parEchoes !== undefined && level.parEchoes > level.maxEchoes) err('parEchoes exceeds maxEchoes');
  }
  try {
    JSON.parse(JSON.stringify(level));
  } catch {
    err('level is not JSON-serializable');
  }
  return issues;
}

const SOLID_DEVICE_KINDS = new Set(['timedSwitch', 'energySocket', 'laserEmitter', 'laserReceiver']);

/** Component-specific authoring rules (see the behaviour docs in src/gameplay/entities). */
function validateComponents(
  level: LevelDefinition,
  err: (m: string) => void,
  warn: (m: string) => void,
  walkable: (c: number, r: number) => boolean,
): void {
  const byId = new Map(level.entities.map((e) => [e.id, e] as const));
  const wiredInto = (id: string): number => level.wires.filter((w) => w.to === id).length;
  const at = (c: number, r: number) => level.entities.filter((e) => e.col === c && e.row === r);
  const spawn = level.playerSpawn;

  for (const e of level.entities) {
    switch (e.kind) {
      case 'energySocket': {
        const id = e.config.initialCell;
        if (id === undefined) break;
        const cell = byId.get(id);
        if (!cell || cell.kind !== 'energyCell') err(`socket '${e.id}' initialCell '${id}' is not an energyCell`);
        else if (cell.col !== e.col || cell.row !== e.row) err(`socket '${e.id}' initialCell '${id}' must be placed on the socket's cell`);
        break;
      }
      case 'movingPlatform': {
        const path = e.config.path;
        if (path.length < 2) warn(`platform '${e.id}' path has fewer than 2 waypoints (it never moves)`);
        const first = path[0];
        if (!first || first.col !== e.col || first.row !== e.row) err(`platform '${e.id}' path[0] must equal its cell`);
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          if (a.col !== b.col && a.row !== b.row) warn(`platform '${e.id}' segment ${i} is diagonal`);
        }
        if (e.config.requiresSignal === true && wiredInto(e.id) === 0) warn(`platform '${e.id}' requiresSignal but is unwired`);
        break;
      }
      case 'elevator': {
        const lv = e.config.levels;
        if (lv.length < 2) err(`elevator '${e.id}' needs at least 2 levels`);
        for (let i = 1; i < lv.length; i++) if ((lv[i] ?? 0) <= (lv[i - 1] ?? 0)) err(`elevator '${e.id}' levels must ascend`);
        const start = lv[e.config.startIndex ?? 0];
        if (e.level !== undefined && start !== undefined && e.level !== start)
          warn(`elevator '${e.id}' level ${e.level} differs from its start level ${start}`);
        if ((e.config.mode ?? 'signal') === 'signal' && wiredInto(e.id) === 0) warn(`signal elevator '${e.id}' is unwired (never moves)`);
        break;
      }
      case 'timedSwitch':
        if (!(e.config.durationTicks > 0)) err(`timed switch '${e.id}' needs durationTicks > 0`);
        break;
      case 'laserEmitter':
        if (e.facing === undefined) warn(`laser emitter '${e.id}' has no facing (defaults to north)`);
        break;
      case 'temporalGate':
        if (e.config.requiresSignal === true && wiredInto(e.id) === 0) warn(`gate '${e.id}' requiresSignal but is unwired`);
        break;
      case 'door':
        if (wiredInto(e.id) === 0) warn(`door '${e.id}' is unwired (keeps its initial state)`);
        break;
      default:
        break;
    }
    if (SOLID_DEVICE_KINDS.has(e.kind) && e.col === spawn.col && e.row === spawn.row) err(`solid '${e.id}' sits on the player spawn`);
    if ((e.kind === 'crate' || e.kind === 'energyCell') && !walkable(e.col, e.row)) {
      const deck = at(e.col, e.row).some((o) => o.kind === 'elevator' || o.kind === 'movingPlatform');
      if (!deck) err(`carriable '${e.id}' starts on a non-walkable tile`);
    }
  }
  for (const w of level.wires) {
    if (w.from === w.to) warn(`wire loops '${w.from}' into itself`);
  }
}
