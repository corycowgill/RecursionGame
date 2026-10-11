import { PHYS, type EntityDefinition, type LevelDefinition, type Tile } from '../../engine/contracts';
import { parseTiles } from '../../engine/simulation/runtime';

/**
 * STATIC NAVIGATION GRAPH for the puzzle solver (src/testing/solver). Read-only analysis of a LevelDefinition:
 * which cells a body can stand on, at which height levels, and how they connect. Dynamic things (doors, gates,
 * lifts, decks) are treated OPTIMISTICALLY here — a door cell is a walkable cell, a lift shaft joins all of its
 * levels, a deck lane is walkable — and the closed-loop navigator in macros.ts simply pushes into whatever is
 * shut and waits. That is exactly how a human (and the hand-written level solutions) behave, and it is what makes
 * "blind" recordings possible: an echo pushing into a shut door walks on once a later loop opens it.
 *
 * Costs are in ticks at PHYS.ACTOR_SPEED: 25 per straight tile, 36 per diagonal tile (ACTOR_SPEED_DIAG per axis).
 */

export interface NavCell {
  col: number;
  row: number;
}

export const STRAIGHT_TICKS = Math.ceil(1000 / PHYS.ACTOR_SPEED);
export const DIAGONAL_TICKS = Math.ceil(1000 / PHYS.ACTOR_SPEED_DIAG);

/** Entity kinds whose cell is permanently solid for walking (consoles, pedestals, emitters). */
const STATIC_SOLID_KINDS = new Set(['timedSwitch', 'energySocket', 'laserEmitter', 'laserReceiver']);

type CellRole = 'floor' | 'door' | 'gate' | 'lift' | 'lane';

export class NavGraph {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];
  /** Height levels a body can stand at on each cell (empty = impassable). */
  private readonly levels: number[][];
  private readonly roles: CellRole[];
  private readonly laneOf: (string | null)[];
  private readonly distCache = new Map<number, Float64Array>();

  constructor(readonly level: LevelDefinition) {
    this.width = level.grid.width;
    this.height = level.grid.height;
    this.tiles = parseTiles(level);
    const n = this.width * this.height;
    this.levels = Array.from({ length: n }, () => []);
    this.roles = Array.from({ length: n }, () => 'floor' as CellRole);
    this.laneOf = Array.from({ length: n }, () => null);

    for (let row = 0; row < this.height; row++)
      for (let col = 0; col < this.width; col++) {
        const t = this.tile(col, row);
        if (!t) continue;
        if (t.kind === 'floor') this.levels[this.idx(col, row)] = [t.h];
        else if (t.kind === 'ramp') this.levels[this.idx(col, row)] = [t.h, t.h + 1];
      }
    for (const e of level.entities) this.applyEntity(e);
  }

  private applyEntity(e: EntityDefinition): void {
    const i = this.idx(e.col, e.row);
    if (STATIC_SOLID_KINDS.has(e.kind)) {
      this.levels[i] = [];
      return;
    }
    if (e.kind === 'door' && this.levels[i]!.length > 0) this.roles[i] = 'door';
    if (e.kind === 'temporalGate' && this.levels[i]!.length > 0) this.roles[i] = 'gate';
    if (e.kind === 'elevator') {
      const cfg = e.config as { levels: number[] };
      this.levels[i] = [...cfg.levels];
      this.roles[i] = 'lift';
    }
    if (e.kind === 'movingPlatform') {
      const cfg = e.config as { path: { col: number; row: number }[] };
      const y = e.level ?? this.tile(e.col, e.row)?.h ?? 0;
      const pts = cfg.path;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k]!;
        const b = pts[k + 1]!;
        const dc = Math.sign(b.col - a.col);
        const dr = Math.sign(b.row - a.row);
        let c = a.col;
        let r = a.row;
        for (;;) {
          const j = this.idx(c, r);
          if (this.tile(c, r)?.kind === 'void' || this.roles[j] === 'lane') {
            this.levels[j] = [y];
            this.roles[j] = 'lane';
            this.laneOf[j] = e.id;
          }
          if (c === b.col && r === b.row) break;
          c += dc;
          r += dr;
        }
      }
    }
  }

  idx(col: number, row: number): number {
    return row * this.width + col;
  }

  tile(col: number, row: number): Tile | undefined {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return undefined;
    return this.tiles[this.idx(col, row)];
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.width && row < this.height;
  }

  passable(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.levels[this.idx(col, row)]!.length > 0;
  }

  levelsAt(col: number, row: number): readonly number[] {
    return this.inBounds(col, row) ? this.levels[this.idx(col, row)]! : [];
  }

  role(col: number, row: number): CellRole {
    return this.roles[this.idx(col, row)] ?? 'floor';
  }

  /** The moving platform whose lane covers this cell, if any. */
  laneEntity(col: number, row: number): string | null {
    return this.inBounds(col, row) ? (this.laneOf[this.idx(col, row)] ?? null) : null;
  }

  /** Doors, gates, lifts and deck lanes: never merged away by path smoothing, never cut diagonally. */
  isConnector(col: number, row: number): boolean {
    return this.role(col, row) !== 'floor';
  }

  private compatible(a: NavCell, b: NavCell): boolean {
    const la = this.levelsAt(a.col, a.row);
    const lb = this.levelsAt(b.col, b.row);
    return la.some((x) => lb.includes(x));
  }

  private neighbours(c: NavCell): { cell: NavCell; cost: number }[] {
    const out: { cell: NavCell; cost: number }[] = [];
    if (!this.passable(c.col, c.row)) return out;
    for (const [dc, dr] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const n = { col: c.col + dc, row: c.row + dr };
      if (this.passable(n.col, n.row) && this.compatible(c, n)) out.push({ cell: n, cost: STRAIGHT_TICKS });
    }
    if (this.isConnector(c.col, c.row)) return out;
    for (const [dc, dr] of [
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const n = { col: c.col + dc, row: c.row + dr };
      const s1 = { col: c.col + dc, row: c.row };
      const s2 = { col: c.col, row: c.row + dr };
      const ok =
        [n, s1, s2].every((x) => this.passable(x.col, x.row) && !this.isConnector(x.col, x.row)) &&
        this.compatible(c, n) &&
        this.compatible(c, s1) &&
        this.compatible(c, s2);
      if (ok) out.push({ cell: n, cost: DIAGONAL_TICKS });
    }
    return out;
  }

  /** Dijkstra distances (ticks) from `from` to every reachable cell. */
  distances(from: NavCell): Float64Array {
    const n = this.width * this.height;
    const dist = new Float64Array(n).fill(Infinity);
    const start = this.idx(from.col, from.row);
    if (!this.inBounds(from.col, from.row)) return dist;
    dist[start] = 0;
    // Small graphs (< 500 cells): an O(V^2) Dijkstra is simple and fast enough.
    const done = new Uint8Array(n);
    for (;;) {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < bd) (bd = dist[i]!), (best = i);
      if (best < 0) break;
      done[best] = 1;
      const c = { col: best % this.width, row: Math.floor(best / this.width) };
      for (const { cell, cost } of this.neighbours(c)) {
        const j = this.idx(cell.col, cell.row);
        if (bd + cost < dist[j]!) dist[j] = bd + cost;
      }
    }
    return dist;
  }

  /** Cached distances to a target cell (the graph is static and symmetric). */
  distancesTo(to: NavCell): Float64Array {
    const k = this.idx(to.col, to.row);
    let d = this.distCache.get(k);
    if (!d) {
      d = this.distances(to);
      this.distCache.set(k, d);
    }
    return d;
  }

  /** Optimistic travel time in ticks between two cells (Infinity when unreachable). */
  ticksBetween(a: NavCell, b: NavCell): number {
    if (!this.inBounds(a.col, a.row) || !this.inBounds(b.col, b.row)) return Infinity;
    return this.distancesTo(b)[this.idx(a.col, a.row)]!;
  }

  /** Shortest cell path (inclusive) from `from` to `to`, or null when unreachable even optimistically. */
  path(from: NavCell, to: NavCell): NavCell[] | null {
    if (!this.inBounds(from.col, from.row) || !this.inBounds(to.col, to.row)) return null;
    const distTo = this.distancesTo(to); // graph is symmetric: walk downhill from `from` towards `to`
    if (!Number.isFinite(distTo[this.idx(from.col, from.row)]!)) return null;
    const out: NavCell[] = [from];
    let cur = from;
    let guard = this.width * this.height;
    while ((cur.col !== to.col || cur.row !== to.row) && guard-- > 0) {
      // Prefer straight moves on ties (neighbours() lists them first), so paths hug the obvious line.
      let best: NavCell | null = null;
      let bd = Infinity;
      const here = distTo[this.idx(cur.col, cur.row)]!;
      for (const { cell, cost } of this.neighbours(cur)) {
        const dn = distTo[this.idx(cell.col, cell.row)]!;
        if (dn < here && dn + cost < bd) {
          best = cell;
          bd = dn + cost;
        }
      }
      if (!best) return null;
      out.push(best);
      cur = best;
    }
    return out;
  }

  /** Path length in ticks along a cell path (optimistic: no waiting). */
  pathTicks(path: readonly NavCell[]): number {
    let t = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      t += a.col !== b.col && a.row !== b.row ? DIAGONAL_TICKS : STRAIGHT_TICKS;
    }
    return t;
  }

  /**
   * Path smoothing: drop intermediate waypoints wherever the navigator's straight-line steering (diagonal first,
   * then straight — the moveTo controller) keeps the whole body footprint on passable, same-level, non-connector
   * cells. Connector cells (doors, gates, lifts, lanes) always stay waypoints.
   */
  waypoints(path: readonly NavCell[]): NavCell[] {
    if (path.length <= 2) return [...path];
    const out: NavCell[] = [path[0]!];
    let i = 0;
    while (i < path.length - 1) {
      let j = i + 1;
      for (let k = path.length - 1; k > i + 1; k--) {
        if (this.segmentClear(path, i, k)) {
          j = k;
          break;
        }
      }
      out.push(path[j]!);
      i = j;
    }
    return out;
  }

  private segmentClear(path: readonly NavCell[], i: number, k: number): boolean {
    for (let m = i + 1; m < k; m++) if (this.isConnector(path[m]!.col, path[m]!.row)) return false;
    const a = path[i]!;
    const b = path[k]!;
    if (this.isConnector(a.col, a.row) || this.isConnector(b.col, b.row)) return false;
    const lv = this.levelsAt(a.col, a.row);
    let x = a.col * 1000 + 500;
    let z = a.row * 1000 + 500;
    const tx = b.col * 1000 + 500;
    const tz = b.row * 1000 + 500;
    const half = PHYS.ACTOR_HALF + 20;
    for (let guard = 0; guard < 4000; guard++) {
      for (const [ox, oz] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ] as const) {
        const c = Math.floor((x + ox) / 1000);
        const r = Math.floor((z + oz) / 1000);
        if (!this.passable(c, r) || this.isConnector(c, r)) return false;
        if (!this.levelsAt(c, r).some((l) => lv.includes(l))) return false;
      }
      if (x === tx && z === tz) return true;
      const dx = Math.sign(tx - x);
      const dz = Math.sign(tz - z);
      const step = 50;
      x = dx === 0 ? x : dx > 0 ? Math.min(tx, x + step) : Math.max(tx, x - step);
      z = dz === 0 ? z : dz > 0 ? Math.min(tz, z + step) : Math.max(tz, z - step);
    }
    return false;
  }

  /** Walkable 4-neighbours of a cell from which a body facing the cell probes it (PHYS.REACH lands inside it). */
  approachCells(target: NavCell): { cell: NavCell; facing: 0 | 1 | 2 | 3 }[] {
    const out: { cell: NavCell; facing: 0 | 1 | 2 | 3 }[] = [];
    const opts: [number, number, 0 | 1 | 2 | 3][] = [
      [0, 1, 0], // stand south, face north
      [-1, 0, 1], // stand west, face east
      [0, -1, 2], // stand north, face south
      [1, 0, 3], // stand east, face west
    ];
    for (const [dc, dr, facing] of opts) {
      const c = { col: target.col + dc, row: target.row + dr };
      if (this.passable(c.col, c.row) && this.role(c.col, c.row) !== 'lane') out.push({ cell: c, facing });
    }
    return out;
  }
}
