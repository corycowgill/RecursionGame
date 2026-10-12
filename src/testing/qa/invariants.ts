import {
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorState,
  type AnySimEntity,
  type LevelDefinition,
  type SimState,
  type SimView,
  type TemporalLoop,
} from '../../engine/contracts';
import { assertPlainIntegerData } from '../../engine/simulation/clone';
import { replayTracks } from '../../engine/simulation/recursion';
import type { EntityRegistry } from '../../engine/simulation/registry';
import { LevelRuntimeImpl } from '../../engine/simulation/runtime';
import { buildCollisionWorld } from '../../engine/physics/collision';
import { buildSurfaceOverrides, cellKey, cellSurfaceAtPoint, type SurfaceOverrides } from '../../engine/physics/terrain';
import { createDefaultRegistry } from '../../gameplay/entities';

/**
 * QA INVARIANTS — read-only checks over a SimView that must hold after every tick of every pass, whatever the
 * player (or a fuzzer) does. They never mutate the state and never feed anything back into the simulation.
 *
 * Categories (Violation.rule):
 *   data        state is plain integer data (no NaN / floats / undefined), tick & status are sane
 *   actors      actor list matches the loop list (echoes by index, player last, unique ids)
 *   wall        an actor's footprint overlaps a wall / pillar / railing cell, or its centre floats over a pit
 *   platform    like 'wall' (floating over a pit) but inside a moving platform's travel lane: the KNOWN cell-granular
 *               deck-surface bug (a rider on the straddled half of a deck is left over the void when it moves on)
 *   ledge       an actor's footprint overlaps a walk surface more than STEP_TOLERANCE above its feet
 *   solid       an actor's footprint overlaps a solid entity (closed door, resting crate, console...)
 *   ownership   carry links are not mirrored (actor.carrying <-> entity.carriedBy), double carriers, ...
 *   socket      energy cell <-> socket links are not mirrored
 *   item        a resting carriable item is inside geometry or shares a cell with another resting item
 *   softlock    a resting carriable item can no longer be reached by any actor (no standable cell to face it from)
 */

export type InvariantRule = 'data' | 'actors' | 'wall' | 'platform' | 'ledge' | 'solid' | 'ownership' | 'socket' | 'item' | 'softlock';

export interface Violation {
  rule: InvariantRule;
  tick: number;
  message: string;
  /** Kind of the entity involved (solid / ledge-by-entity-surface / item violations), when there is one. */
  entityKind?: string;
}

export interface InvariantOptions {
  /** Skip the per-cell ledge check (useful on levels with moving vertical surfaces). default false */
  skipLedge?: boolean;
}

/** Static level context for invariant checks (built once per level; read-only). */
export class InvariantChecker {
  readonly rt: LevelRuntimeImpl;
  readonly level: LevelDefinition;

  /** Cells a moving platform travels through (straight segments between consecutive waypoints). */
  private readonly platformLane = new Set<number>();

  constructor(level: LevelDefinition, registry: EntityRegistry = createDefaultRegistry()) {
    this.level = level;
    this.rt = new LevelRuntimeImpl(level, registry);
    for (const def of level.entities) {
      if (def.kind !== 'movingPlatform') continue;
      const path = def.config.path;
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        if (!a || !b) continue;
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
          for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) this.platformLane.add(cellKey(c, r));
      }
    }
  }

  /** Runs every invariant over `view`. `loops` is the game's current loop list (for actor-list checks). */
  check(view: SimView, loops: readonly TemporalLoop[], opts: InvariantOptions = {}): Violation[] {
    const out: Violation[] = [];
    const tick = view.tick;
    const add = (rule: InvariantRule, message: string, entityKind?: string): void =>
      void out.push(entityKind === undefined ? { rule, tick, message } : { rule, tick, message, entityKind });
    // The engine helpers only read; the casts drop the readonly view type.
    const state = view as unknown as SimState;

    // ---- data
    try {
      assertPlainIntegerData(state);
    } catch (err) {
      add('data', String(err instanceof Error ? err.message : err));
    }
    if (tick < 0 || tick > this.level.loopDurationTicks) add('data', `tick ${tick} outside [0, ${this.level.loopDurationTicks}]`);
    if (state.status !== 'playing' && state.status !== 'complete' && state.status !== 'timeUp') add('data', `bad status ${String(state.status)}`);
    if (state.status === 'complete' && state.completedAtTick === null) add('data', 'complete without completedAtTick');
    if (state.status !== 'complete' && state.completedAtTick !== null) add('data', `completedAtTick set while ${state.status}`);
    if (state.status === 'timeUp' && tick !== this.level.loopDurationTicks) add('data', `timeUp at tick ${tick}`);

    // ---- actor list
    const actors = state.actors;
    // One echo actor per replay track (a loop plus its nested-loop copies when level.recursion is set), player last.
    const tracks = replayTracks(this.level, loops);
    if (actors.length !== tracks.length + 1) add('actors', `${actors.length} actors for ${loops.length} loops (${tracks.length} replay tracks)`);
    const last = actors[actors.length - 1];
    if (!last || last.id !== 'player' || last.kind !== 'player') add('actors', 'player is not the last actor');
    const ids = new Set<string>();
    actors.forEach((a, i) => {
      if (ids.has(a.id)) add('actors', `duplicate actor id ${a.id}`);
      ids.add(a.id);
      if (a.kind === 'echo') {
        const track = tracks[i];
        const loop = track?.loop;
        if (!track || a.echoIndex !== track.loopIndex) add('actors', `${a.id} echoIndex ${a.echoIndex} at position ${i}`);
        if (!track || !loop || a.id !== track.actorId || a.loopId !== loop.id || (a.recursion ?? 0) !== track.depth)
          add('actors', `${a.id} does not match loop ${loop?.id ?? '?'}`);
      }
      if (a.facing < 0 || a.facing > 3) add('actors', `${a.id} facing ${a.facing}`);
      if (a.kind === 'player' && a.finished) add('actors', 'player flagged finished');
    });

    // ---- geometry
    const overrides = buildSurfaceOverrides(this.rt, state);
    const world = buildCollisionWorld(this.rt, state);
    for (const a of actors) {
      this.checkActorGeometry(a, overrides, opts, add);
      for (const b of world.solids) {
        if (!(a.y < b.maxY && b.minY < a.y + PHYS.ACTOR_HEIGHT)) continue;
        if (b.blocks && !b.blocks(a)) continue;
        // Round 6: an actor overlapping a check valve is always one the valve admitted (collision only refuses
        // ENTERING the cell; the directional predicate deliberately reports a body straddling the downstream edge as
        // "solid for" it so it cannot come back once fully out). The directional rule is checked across ticks by
        // checkValveCrossings().
        if (this.rt.def(b.entityId).kind === 'checkValve') continue;
        if (a.x - PHYS.ACTOR_HALF < b.maxX && b.minX < a.x + PHYS.ACTOR_HALF && a.z - PHYS.ACTOR_HALF < b.maxZ && b.minZ < a.z + PHYS.ACTOR_HALF)
        {
          const kind = this.rt.def(b.entityId).kind;
          add('solid', `${a.id} at (${a.x},${a.y},${a.z}) overlaps solid ${kind} '${b.entityId}'`, kind);
        }
      }
    }

    // ---- ownership
    const carriers = new Map<string, string>();
    for (const a of actors) {
      if (a.carrying === null) continue;
      const e = state.entities[a.carrying];
      if (!e) {
        add('ownership', `${a.id} carries unknown entity ${a.carrying}`);
        continue;
      }
      if (e.carriedBy !== a.id) add('ownership', `${a.id} carries ${e.id} but ${e.id}.carriedBy = ${String(e.carriedBy)}`);
      const prev = carriers.get(e.id);
      if (prev) add('ownership', `${e.id} carried by both ${prev} and ${a.id}`);
      carriers.set(e.id, a.id);
      if (Math.abs(e.x - a.x) > UNITS_PER_TILE || Math.abs(e.z - a.z) > UNITS_PER_TILE)
        add('ownership', `${e.id} is ${e.x - a.x},${e.z - a.z} away from its carrier ${a.id}`);
    }
    const resting = new Map<number, string>();
    for (const id of this.rt.entityOrder) {
      const e = state.entities[id];
      if (!e) {
        add('data', `entity ${id} missing from state`);
        continue;
      }
      const b = this.rt.behaviourFor(e.kind);
      if (e.carriedBy !== null) {
        if (!b.carriable) add('ownership', `non-carriable ${id} carried by ${e.carriedBy}`);
        const c = actors.find((x) => x.id === e.carriedBy);
        if (!c) add('ownership', `${id} carried by missing actor ${e.carriedBy}`);
        else if (c.carrying !== id) add('ownership', `${id}.carriedBy=${e.carriedBy} but carrier holds ${String(c.carrying)}`);
        continue;
      }
      if (!b.carriable) continue;
      this.checkRestingItem(e, overrides, resting, add);
    }

    // ---- sockets
    for (const id of this.rt.entityOrder) {
      const e = state.entities[id];
      if (!e) continue;
      if (e.kind === 'energySocket') {
        const cellId = e.state.cellId;
        if (cellId !== null) {
          const c = state.entities[cellId];
          if (!c || c.kind !== 'energyCell') add('socket', `${id} holds non-cell ${cellId}`);
          else {
            if (c.state.socketId !== id) add('socket', `${id} holds ${cellId} but its socketId = ${String(c.state.socketId)}`);
            if (c.carriedBy !== null) add('socket', `${cellId} is seated in ${id} and carried by ${c.carriedBy}`);
          }
        }
      } else if (e.kind === 'energyCell' && e.state.socketId !== null) {
        const s = state.entities[e.state.socketId];
        if (!s || s.kind !== 'energySocket' || s.state.cellId !== id) add('socket', `${id}.socketId = ${e.state.socketId} is not mirrored`);
      }
    }
    return out;
  }

  private checkActorGeometry(a: ActorState, overrides: SurfaceOverrides, opts: InvariantOptions, add: (r: InvariantRule, m: string, k?: string) => void): void {
    const H = PHYS.ACTOR_HALF;
    const col0 = fdiv(a.x - H, UNITS_PER_TILE);
    const col1 = fdiv(a.x + H - 1, UNITS_PER_TILE);
    const row0 = fdiv(a.z - H, UNITS_PER_TILE);
    const row1 = fdiv(a.z + H - 1, UNITS_PER_TILE);
    // The centre must always be over a walk surface (otherwise the actor floats over a pit).
    const cc = fdiv(a.x, UNITS_PER_TILE);
    const cr = fdiv(a.z, UNITS_PER_TILE);
    if (cellSurfaceAtPoint(this.rt, overrides, cc, cr, a.x, a.z) === null)
      add(this.platformLane.has(cellKey(cc, cr)) ? 'platform' : 'wall', `${a.id} at (${a.x},${a.y},${a.z}) floats: no walk surface under its centre (${this.rt.tileAt(cc, cr).kind} cell ${cc},${cr})`);
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const s = cellSurfaceAtPoint(this.rt, overrides, col, row, a.x, a.z);
        if (s === null) {
          // Overhanging a pit at a ledge / deck edge is fine; overlapping solid geometry is not.
          const kind = this.rt.tileAt(col, row).kind;
          if (kind !== 'void') add('wall', `${a.id} at (${a.x},${a.z}) overlaps ${kind} cell (${col},${row})`);
          continue;
        }
        if (opts.skipLedge) continue;
        // Only surfaces ABOVE the feet are intrusions (body inside raised terrain); overhanging a lower floor at a
        // ledge edge is normal.
        if (s - a.y > PHYS.STEP_TOLERANCE) {
          const by = overrides.has(cellKey(col, row)) ? this.surfaceEntityKind(col, row) : undefined;
          add('ledge', `${a.id} feet y=${a.y} but cell (${col},${row}) surface is ${s}${by ? ` (${by})` : ''} near (${a.x},${a.z}): body inside raised terrain`, by);
        }
      }
    }
  }

  /** Last seen actor centres (per actor id) and valve directions, for checkValveCrossings. */
  private valveMemo: { tick: number; actors: Map<string, { x: number; z: number; y: number }>; dirs: Map<string, number> } | null = null;

  /**
   * (round 6) Stateful check-valve rule, to be called once per simulated tick IN ORDER (it remembers the previous tick
   * and resets itself when the tick does not advance by one, e.g. on a new pass): no actor may go from NOT overlapping a
   * valve cell, with its centre downstream (along >= HALF_TILE) or beside it (lateral >= HALF_TILE) of the direction
   * the valve had during that move, to overlapping it. Previews / scrubs must not call it.
   */
  checkValveCrossings(view: SimView): Violation[] {
    const out: Violation[] = [];
    const valves = this.level.entities.filter((d) => d.kind === 'checkValve');
    if (valves.length === 0) return out;
    const memo = this.valveMemo;
    const prevOk = memo !== null && memo.tick + 1 === view.tick;
    const actors = new Map<string, { x: number; z: number; y: number }>();
    for (const a of view.actors) actors.set(a.id, { x: a.x, z: a.z, y: a.y });
    const dirs = new Map<string, number>();
    for (const d of valves) {
      const e = view.entities[d.id];
      if (!e || e.kind !== 'checkValve') continue;
      dirs.set(d.id, e.state.dir);
      if (!prevOk) continue;
      const dir = memo.dirs.get(d.id);
      if (dir === undefined) continue;
      const ux = dir === 1 ? 1 : dir === 3 ? -1 : 0;
      const uz = dir === 2 ? 1 : dir === 0 ? -1 : 0;
      const cx = d.col * UNITS_PER_TILE + 500;
      const cz = d.row * UNITS_PER_TILE + 500;
      const H = PHYS.ACTOR_HALF;
      const overlaps = (p: { x: number; z: number }) => Math.abs(p.x - cx) < 500 + H && Math.abs(p.z - cz) < 500 + H;
      for (const a of view.actors) {
        const before = memo.actors.get(a.id);
        if (!before || Math.abs(before.y - e.y) >= 1000) continue;
        if (overlaps(before) || !overlaps(a)) continue;
        const dx = before.x - cx;
        const dz = before.z - cz;
        const along = dx * ux + dz * uz;
        const lateral = Math.abs(dx * uz - dz * ux);
        if (along >= 500 || lateral >= 500)
          out.push({ rule: 'solid', tick: view.tick, message: `${a.id} entered check valve '${d.id}' against its direction (from ${before.x},${before.z} to ${a.x},${a.z}, dir ${dir})`, entityKind: 'checkValve' });
      }
    }
    this.valveMemo = { tick: view.tick, actors, dirs };
    return out;
  }

  /** Kind of the entity providing a surface override at a cell (elevator / moving platform), if any. */
  private surfaceEntityKind(col: number, row: number): string | undefined {
    for (const d of this.level.entities) if ((d.kind === 'elevator' || d.kind === 'movingPlatform') && d.col === col && d.row === row) return d.kind;
    return this.platformLane.has(cellKey(col, row)) ? 'movingPlatform' : undefined;
  }

  private checkRestingItem(e: AnySimEntity, overrides: SurfaceOverrides, resting: Map<number, string>, add: (r: InvariantRule, m: string) => void): void {
    const col = fdiv(e.x, UNITS_PER_TILE);
    const row = fdiv(e.z, UNITS_PER_TILE);
    const seated = e.kind === 'energyCell' && e.state.socketId !== null;
    if (seated) return; // a seated cell lives inside its socket's cell
    const s = cellSurfaceAtPoint(this.rt, overrides, col, row, e.x, e.z);
    if (s === null) add('item', `${e.id} rests in a ${this.rt.tileAt(col, row).kind} cell (${col},${row})`);
    const key = cellKey(col, row);
    const other = resting.get(key);
    if (other) add('item', `${e.id} and ${other} both rest in cell (${col},${row})`);
    resting.set(key, e.id);

    // Recoverability: some actor must be able to stand in the item's own cell (non-solid items) or in a
    // 4-neighbour cell at a compatible height and face it (the probe reaches one cell along the facing).
    const solidItem = this.rt.behaviourFor(e.kind).isSolid?.(e, this.rt.def(e.id)) ?? false;
    const standable = (c: number, r: number): boolean => {
      const t = cellSurfaceAtPoint(this.rt, overrides, c, r, c * UNITS_PER_TILE + 500, r * UNITS_PER_TILE + 500);
      return t !== null && Math.abs(t - e.y) < UNITS_PER_TILE;
    };
    const ok =
      (!solidItem && standable(col, row)) ||
      standable(col + 1, row) ||
      standable(col - 1, row) ||
      standable(col, row + 1) ||
      standable(col, row - 1);
    if (!ok) add('softlock', `${e.id} at cell (${col},${row}) y=${e.y} has no standable neighbour: it can never be picked up again`);
  }
}

/** Short human summary of violations grouped by rule (for assertion messages). */
export function summarizeViolations(vs: readonly Violation[], max = 8): string {
  if (vs.length === 0) return 'no violations';
  const by = new Map<string, number>();
  for (const v of vs) by.set(v.rule, (by.get(v.rule) ?? 0) + 1);
  const head = vs.slice(0, max).map((v) => `  [${v.rule}] t=${v.tick} ${v.message}`);
  return `${vs.length} violations (${[...by].map(([k, n]) => `${k}:${n}`).join(', ')})\n${head.join('\n')}`;
}
