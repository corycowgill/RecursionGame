import {
  PHYS,
  UNITS_PER_TILE,
  cellCenter,
  dir8FromMove,
  echoActorId,
  fdiv,
  PLAYER_ACTOR_ID,
  type ActorState,
  type AnySimEntity,
  type Dir4,
  type EntityKind,
  type LevelRuntime,
  type PlayerInput,
  type RecordedInteraction,
  type SimEntity,
  type SimEvent,
  type SimState,
  type TemporalLoop,
} from '../contracts';
import { buildCollisionWorld, moveAxis, settleOnSurface, type CollisionWorld } from '../physics/collision';
import { buildSurfaceOverrides, cellKey, surfaceAt, tileSurfaceAt } from '../physics/terrain';
import { TickContext } from './context';
import { attachToCarrier, resolveInteraction, sameOutcome } from './interactions';
import { replayTracks } from './recursion';
import { seedRng } from './rng';

/** Per-actor driving data for one tick. */
export interface ActorFrame {
  input: PlayerInput;
  /**
   * Echo only: recorded outcomes for this tick keyed by verb, used for divergence detection.
   * Undefined for the player.
   */
  expected?: { interact?: RecordedInteraction; action?: RecordedInteraction };
  /** Echo only: true when the loop has no more inputs (tick >= durationTicks). */
  replayFinished?: boolean;
}

/** Interaction outcomes + divergences produced by one tick (consumed by TemporalGame for timeline/recording). */
export interface TickReport {
  tick: number;
  interactions: { actorId: ActorState['id']; outcome: RecordedInteraction }[];
  divergences: { actorId: ActorState['id']; expected: RecordedInteraction; actual: RecordedInteraction }[];
}

/* ------------------------------------------------------------------------------------------------ */

function makeActor(
  rt: LevelRuntime,
  kind: 'player' | 'echo',
  echoIndex: number,
  loopId: number | null,
  id?: ActorState['id'],
  recursion = 0,
): ActorState {
  const spawn = rt.level.playerSpawn;
  const c = cellCenter(spawn.col, spawn.row);
  const tile = rt.tileAt(spawn.col, spawn.row);
  const y = tileSurfaceAt(tile, spawn.col, spawn.row, c.x, c.z) ?? tile.h * 1000;
  const facing: Dir4 = spawn.facing ?? 2;
  const heading = ([0, 2, 4, 6] as const)[facing];
  const actor: ActorState = {
    id: id ?? (kind === 'player' ? PLAYER_ACTOR_ID : echoActorId(loopId ?? 0)),
    kind,
    echoIndex,
    loopId,
    x: c.x,
    y,
    z: c.z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing,
    heading,
    moving: false,
    carrying: null,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
  };
  // Only nested-loop copies carry the field, so ordinary states (and their hashes) are unchanged.
  if (recursion > 0) actor.recursion = recursion;
  return actor;
}

/**
 * Builds the deterministic tick-0 state for a pass with the given echo loops. With LevelDefinition.recursion each
 * loop also spawns its recursive copies (see simulation/recursion.ts for the actor order).
 */
export function createInitialState(rt: LevelRuntime, loops: readonly TemporalLoop[]): SimState {
  const actors: ActorState[] = replayTracks(rt.level, loops).map((t) =>
    makeActor(rt, 'echo', t.loopIndex, t.loop.id, t.actorId, t.depth),
  );
  actors.push(makeActor(rt, 'player', -1, null));

  const entities: Record<string, AnySimEntity> = {};
  const signals: Record<string, boolean> = {};
  const initCtx = { runtime: rt };
  for (const id of rt.entityOrder) {
    const def = rt.def(id);
    const b = rt.behaviourFor(def.kind);
    const c = cellCenter(def.col, def.row);
    const tile = rt.tileAt(def.col, def.row);
    const y = def.level !== undefined ? def.level * 1000 : (tileSurfaceAt(tile, def.col, def.row, c.x, c.z) ?? tile.h * 1000);
    const state = b.reset(def, initCtx);
    const e = { id, kind: def.kind, x: c.x, y, z: c.z, carriedBy: null, state } as AnySimEntity;
    entities[id] = e;
    signals[id] = b.initialOutput ? b.initialOutput(def, state) : false;
  }
  return {
    tick: 0,
    status: 'playing',
    completedAtTick: null,
    rng: seedRng(rt.level.seed ?? 1),
    actors,
    entities,
    signals,
  };
}

/* ------------------------------------------------------------------------------------------------ */

function updateFacing(actor: ActorState, mx: number, mz: number): void {
  if (mx === 0 && mz === 0) return;
  const h = dir8FromMove(mx, mz);
  if (h !== null) actor.heading = h;
  const fx: Dir4 = mx > 0 ? 1 : 3;
  const fz: Dir4 = mz > 0 ? 2 : 0;
  if (mx !== 0 && mz !== 0) {
    // Diagonal: keep the current facing if it is one of the two components, else prefer horizontal.
    if (actor.facing !== fx && actor.facing !== fz) actor.facing = fx;
  } else if (mx !== 0) {
    actor.facing = fx;
  } else {
    actor.facing = fz;
  }
}

/**
 * The carrier (surface-providing entity with carrierDelta: moving platform, elevator) the actor's centre stands on,
 * or null. Mirrors the terrain rule: the first provider in id order whose (clipped) surface covers the centre point
 * owns it, and the actor must be within STEP_TOLERANCE of that surface.
 */
function carrierUnder(rt: LevelRuntime, state: SimState, actor: ActorState): AnySimEntity | null {
  const col = fdiv(actor.x, UNITS_PER_TILE);
  const row = fdiv(actor.z, UNITS_PER_TILE);
  const key = cellKey(col, row);
  for (const id of rt.entityOrder) {
    const e = state.entities[id];
    if (!e) continue;
    const b = rt.behaviourFor(e.kind);
    if (!b.surfaceCells) continue;
    for (const sc of b.surfaceCells(e, rt.def(id))) {
      if (cellKey(sc.col, sc.row) !== key) continue;
      const c = sc.clip;
      if (c && !(actor.x >= c.minX && actor.x < c.maxX && actor.z >= c.minZ && actor.z < c.maxZ)) continue;
      const d = sc.y - actor.y;
      if (!b.carrierDelta || d > PHYS.STEP_TOLERANCE || d < -PHYS.STEP_TOLERANCE) return null;
      return e;
    }
  }
  return null;
}

function moveActor(
  ctx: TickContext,
  world: CollisionWorld,
  actor: ActorState,
  input: PlayerInput,
): void {
  const x0 = actor.x;
  const y0 = actor.y;
  const z0 = actor.z;
  const cx = x0;
  const cz = z0;

  // Walk (riders are carried later, in the carry phase after the entity update).
  const mx = input.moveX;
  const mz = input.moveY;
  updateFacing(actor, mx, mz);
  const speed = mx !== 0 && mz !== 0 ? PHYS.ACTOR_SPEED_DIAG : PHYS.ACTOR_SPEED;
  moveAxis(world, actor, 'x', mx * speed);
  moveAxis(world, actor, 'z', mz * speed);
  settleOnSurface(world, actor);

  const walkX = actor.x - cx;
  const walkZ = actor.z - cz;
  actor.vx = actor.x - x0;
  actor.vy = actor.y - y0;
  actor.vz = actor.z - z0;
  actor.moving = walkX !== 0 || walkZ !== 0;

  if (actor.moving) {
    actor.strideUnits += (walkX < 0 ? -walkX : walkX) + (walkZ < 0 ? -walkZ : walkZ);
    if (actor.strideUnits >= PHYS.STRIDE) {
      actor.strideUnits -= PHYS.STRIDE;
      ctx.emit({ type: 'footstep', tick: ctx.tick, actorId: actor.id, x: actor.x, y: actor.y, z: actor.z, foot: actor.foot });
      actor.foot = actor.foot === 0 ? 1 : 0;
    }
  } else {
    actor.strideUnits = 0;
  }

  if (actor.carrying !== null) {
    const item = ctx.state.entities[actor.carrying];
    if (item) attachToCarrier(item, actor);
  }
}

/**
 * Carry phase (contracts §6 step 4b, QA-1/QA-3). Each rider (actor whose centre stood on a carrier surface when the
 * entity update began) is moved by the carrier's planar delta of this tick — collision-checked against walls, ledges
 * and solids, but not against the bare pit its footprint overhangs — and then re-seated on the surface under its
 * centre. Riders therefore never lag their deck/lift, so a rider is always over the carrier that supports it.
 */
function carryRiders(ctx: TickContext, riders: readonly { actor: ActorState; carrier: AnySimEntity }[]): void {
  const rt = ctx.runtime;
  const world = buildCollisionWorld(rt, ctx.state);
  for (const { actor, carrier } of riders) {
    const d = rt.behaviourFor(carrier.kind).carrierDelta?.(carrier) ?? null;
    const x0 = actor.x;
    const y0 = actor.y;
    const z0 = actor.z;
    if (d) {
      moveAxis(world, actor, 'x', d.dx, { carry: true });
      moveAxis(world, actor, 'z', d.dz, { carry: true });
    }
    settleOnSurface(world, actor);
    actor.vx += actor.x - x0;
    actor.vy += actor.y - y0;
    actor.vz += actor.z - z0;
    if (actor.carrying !== null) {
      const item = ctx.state.entities[actor.carrying];
      if (item) attachToCarrier(item, actor);
    }
  }
}

/**
 * Advances the simulation by exactly one tick. Pure function of (runtime, state, frames) — mutates `state`
 * in place. `frames[i]` drives `state.actors[i]`. Events are appended to `sink` (pass null to suppress, e.g.
 * during snapshot re-simulation).
 *
 * TICK ORDER (documented contract):
 *   0. if status !== 'playing': no-op
 *   1. per actor (array order): read input, flag echo replay finished
 *   2. INTERACTIONS: per actor (array order): E then Space; ownership resolved immediately; echo outcomes are
 *      compared with the recording -> divergence events
 *   3. MOVEMENT: build collision world once, then per actor (array order): walk X then Z, settle on surface,
 *      carried items follow; then note each actor's carrier (deck/lift surface under its centre), if any
 *   4. ENTITY UPDATE: per entity (id order): behaviour.update reads previous-tick signals, writes next
 *   4b. CARRY: per rider (array order): move by its carrier's delta of this tick (collision-checked), re-seat on
 *      the surface, carried items follow
 *   5. swap signal buffers
 *   6. WIN CHECK: exit portal output (new buffer) is true and the PLAYER's centre is on the exit cell
 *   7. tick += 1; if tick >= loopDurationTicks and still playing -> 'timeUp'
 */
export function stepSim(
  rt: LevelRuntime,
  state: SimState,
  frames: readonly ActorFrame[],
  sink: SimEvent[] | null,
): TickReport {
  const report: TickReport = { tick: state.tick, interactions: [], divergences: [] };
  if (state.status !== 'playing') return report;
  if (frames.length !== state.actors.length)
    throw new Error(`stepSim: ${frames.length} frames for ${state.actors.length} actors`);

  const ctx = new TickContext(rt, state, sink);
  const tick = state.tick;

  // 1. inputs
  for (let i = 0; i < state.actors.length; i++) {
    const actor = state.actors[i] as ActorState;
    const frame = frames[i] as ActorFrame;
    actor.interactHeld = frame.input.interactHeld;
    if (actor.kind === 'echo' && frame.replayFinished && !actor.finished) {
      actor.finished = true;
      ctx.emit({ type: 'echoFinished', tick, actorId: actor.id, loopId: actor.loopId ?? -1, echoIndex: actor.echoIndex });
    }
  }

  // 2. interactions
  for (let i = 0; i < state.actors.length; i++) {
    const actor = state.actors[i] as ActorState;
    const frame = frames[i] as ActorFrame;
    const verbs: ('interact' | 'action')[] = [];
    if (frame.input.interactPressed) verbs.push('interact');
    if (frame.input.actionPressed) verbs.push('action');
    for (const verb of verbs) {
      const outcome = resolveInteraction(ctx, actor, verb);
      report.interactions.push({ actorId: actor.id, outcome });
      const expected = frame.expected?.[verb];
      if (actor.kind === 'echo' && expected && !sameOutcome(expected, outcome)) {
        report.divergences.push({ actorId: actor.id, expected, actual: outcome });
        if (actor.divergedAtTick === null) actor.divergedAtTick = tick;
        actor.divergenceCount += 1;
        ctx.emit({
          type: 'divergence',
          tick,
          actorId: actor.id,
          loopId: actor.loopId ?? -1,
          echoIndex: actor.echoIndex,
          expected,
          actual: outcome,
        });
      }
    }
  }

  // 3. movement
  const world = buildCollisionWorld(rt, state);
  for (let i = 0; i < state.actors.length; i++) {
    moveActor(ctx, world, state.actors[i] as ActorState, (frames[i] as ActorFrame).input);
  }

  // 3b. riders: who stands on a carrier surface now, before the carriers move
  let riders: { actor: ActorState; carrier: AnySimEntity }[] | null = null;
  for (const actor of state.actors) {
    const carrier = carrierUnder(rt, state, actor);
    if (carrier) (riders ??= []).push({ actor, carrier });
  }

  // 4. entity update
  for (const id of rt.entityOrder) {
    const e = state.entities[id];
    if (!e) continue;
    const b = rt.behaviourFor(e.kind);
    if (b.update) b.update(ctx.forEntity(e as SimEntity<EntityKind>));
  }

  // 4b. carry: riders follow the delta their carrier applied in THIS tick's update (no one-tick lag), then re-seat
  //     on the carrier's new surface height (elevators)
  if (riders) carryRiders(ctx, riders);

  // 5. swap signals
  state.signals = ctx.nextSignals;

  // 6. win check
  const exit = state.entities[rt.level.exitId];
  const player = state.actors[state.actors.length - 1];
  if (exit && player && player.kind === 'player' && state.signals[exit.id] === true) {
    const onCell =
      fdiv(player.x, UNITS_PER_TILE) === fdiv(exit.x, UNITS_PER_TILE) &&
      fdiv(player.z, UNITS_PER_TILE) === fdiv(exit.z, UNITS_PER_TILE);
    const dy = player.y - exit.y;
    if (onCell && dy <= PHYS.STEP_TOLERANCE && dy >= -PHYS.STEP_TOLERANCE) {
      state.status = 'complete';
      state.completedAtTick = tick;
      ctx.emit({
        type: 'levelComplete',
        tick,
        levelId: rt.level.id,
        // Recordings used, not bodies: nested-loop copies are free.
        echoesUsed: state.actors.filter((a) => a.kind === 'echo' && a.recursion === undefined).length,
        ticks: tick + 1,
      });
    }
  }

  // 7. advance
  state.tick = tick + 1;
  if (state.status === 'playing' && state.tick >= rt.level.loopDurationTicks) {
    state.status = 'timeUp';
    ctx.emit({ type: 'loopTimeUp', tick, maxTicks: rt.level.loopDurationTicks });
  }
  return report;
}

/** Surface height under an actor (exposed for tools/tests). */
export function surfaceUnder(rt: LevelRuntime, state: SimState, x: number, z: number): number | null {
  return surfaceAt(rt, buildSurfaceOverrides(rt, state), x, z);
}
