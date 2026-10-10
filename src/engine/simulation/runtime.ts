import {
  TILE_LEGEND,
  type EntityDefinition,
  type EntityId,
  type EntityKind,
  type LevelDefinition,
  type LevelRuntime,
  type PuzzleEntityBehaviour,
  type Tile,
  type Wire,
} from '../contracts';
import type { EntityRegistry } from './registry';

const VOID_TILE: Readonly<Tile> = Object.freeze({ kind: 'void', h: 0 });

/** Parses the compact tile/height strings of a level into a Tile array (row-major). Throws on bad data. */
export function parseTiles(level: LevelDefinition): Tile[] {
  const { width, height, tiles, heights } = level.grid;
  if (tiles.length !== height) throw new Error(`Level ${level.id}: grid.tiles has ${tiles.length} rows, expected ${height}`);
  const out: Tile[] = [];
  for (let row = 0; row < height; row++) {
    const line = tiles[row] ?? '';
    if (line.length !== width)
      throw new Error(`Level ${level.id}: row ${row} has ${line.length} chars, expected ${width}`);
    const hLine = heights?.[row];
    if (heights && (hLine === undefined || hLine.length !== width))
      throw new Error(`Level ${level.id}: heights row ${row} must have ${width} chars`);
    for (let col = 0; col < width; col++) {
      const ch = line[col] ?? ' ';
      const legend = TILE_LEGEND[ch];
      if (!legend) throw new Error(`Level ${level.id}: unknown tile char '${ch}' at ${col},${row}`);
      const hc = hLine?.[col] ?? '0';
      const h = hc >= '0' && hc <= '9' ? hc.charCodeAt(0) - 48 : 0;
      const tile: Tile = { kind: legend.kind, h };
      if (legend.dir !== undefined) tile.dir = legend.dir;
      out.push(tile);
    }
  }
  return out;
}

/** Immutable runtime view of a level + its registered behaviours. Built once per loadLevel. */
export class LevelRuntimeImpl implements LevelRuntime {
  readonly level: LevelDefinition;
  readonly width: number;
  readonly height: number;
  readonly entityOrder: readonly EntityId[];
  private readonly tiles: readonly Tile[];
  private readonly defs: ReadonlyMap<EntityId, EntityDefinition>;
  private readonly inputs: ReadonlyMap<EntityId, readonly Wire[]>;
  private readonly behaviours: ReadonlyMap<EntityKind, PuzzleEntityBehaviour<EntityKind>>;

  constructor(level: LevelDefinition, registry: EntityRegistry) {
    this.level = level;
    this.width = level.grid.width;
    this.height = level.grid.height;
    this.tiles = parseTiles(level).map((t) => Object.freeze(t));

    const defs = new Map<EntityId, EntityDefinition>();
    for (const def of level.entities) {
      if (defs.has(def.id)) throw new Error(`Level ${level.id}: duplicate entity id '${def.id}'`);
      defs.set(def.id, def);
    }
    this.defs = defs;
    this.entityOrder = Object.freeze([...defs.keys()].sort(codeUnitCompare));

    const inputs = new Map<EntityId, Wire[]>();
    for (const w of level.wires) {
      if (!defs.has(w.from)) throw new Error(`Level ${level.id}: wire from unknown entity '${w.from}'`);
      if (!defs.has(w.to)) throw new Error(`Level ${level.id}: wire to unknown entity '${w.to}'`);
      const list = inputs.get(w.to) ?? [];
      list.push(w);
      inputs.set(w.to, list);
    }
    for (const list of inputs.values()) list.sort((a, b) => codeUnitCompare(a.from, b.from));
    this.inputs = inputs;

    const behaviours = new Map<EntityKind, PuzzleEntityBehaviour<EntityKind>>();
    for (const def of level.entities) {
      const b = registry.get(def.kind);
      if (!b) throw new Error(`Level ${level.id}: no behaviour registered for entity kind '${def.kind}' (${def.id})`);
      behaviours.set(def.kind, b);
    }
    this.behaviours = behaviours;

    if (!defs.has(level.exitId)) throw new Error(`Level ${level.id}: exitId '${level.exitId}' is not an entity`);
  }

  tileAt(col: number, row: number): Readonly<Tile> {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return VOID_TILE;
    return this.tiles[row * this.width + col] ?? VOID_TILE;
  }

  def(id: EntityId): EntityDefinition {
    const d = this.defs.get(id);
    if (!d) throw new Error(`Unknown entity '${id}'`);
    return d;
  }

  inputsOf(id: EntityId): readonly Wire[] {
    return this.inputs.get(id) ?? EMPTY_WIRES;
  }

  behaviourFor(kind: EntityKind): PuzzleEntityBehaviour<EntityKind> {
    const b = this.behaviours.get(kind);
    if (!b) throw new Error(`No behaviour for kind '${kind}'`);
    return b;
  }
}

const EMPTY_WIRES: readonly Wire[] = Object.freeze([]);

/** Deterministic string ordering (UTF-16 code units). Never use localeCompare in sim code. */
export function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
