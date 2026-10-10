import {
  DIR4_DX,
  DIR4_DZ,
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorId,
  type EntityId,
  type PuzzleEntityBehaviour,
  type SimContext,
  type SimEntity,
} from '../../engine/contracts';
import { entityCell } from './common';

/** Height of the beam above the emitter's base (waist height). */
export const LASER_BEAM_HEIGHT = 500;
const DEFAULT_RANGE_TILES = 32;

export interface BeamTrace {
  /** Beam length in units from the emitter cell centre. */
  length: number;
  hitEntityId: EntityId | null;
  hitActorId: ActorId | null;
}

/**
 * Deterministic grid raycast from an emitter along its facing, at y = emitter.y + LASER_BEAM_HEIGHT.
 * Walks cells outward (k = 1..range):
 *  - walls and pillars stop the beam at the cell's near edge; railings and voids let it pass; terrain whose
 *    surface rises above the beam stops it;
 *  - entities anchored in the cell (id order) whose vertical extent contains the beam: a laser receiver stops it
 *    at the cell centre and is "hit"; otherwise blocksLaser (default isSolid) stops it (crates at their face,
 *    other solids at the centre);
 *  - actors (array order) whose footprint straddles the beam line and whose body spans the beam height stop it
 *    at their near face (the earliest along the beam wins).
 */
export function traceBeam(ctx: SimContext, emitter: SimEntity<'laserEmitter'>): BeamTrace {
  const rt = ctx.runtime;
  const facing = rt.def(emitter.id).facing ?? 0;
  const dx = DIR4_DX[facing] ?? 0;
  const dz = DIR4_DZ[facing] ?? 0;
  const def = rt.def(emitter.id);
  const rangeTiles = def.kind === 'laserEmitter' ? def.config.rangeTiles : undefined;
  const range = Math.max(1, rangeTiles ?? DEFAULT_RANGE_TILES);
  const beamY = emitter.y + LASER_BEAM_HEIGHT;
  const origin = entityCell(emitter);

  let length = range * UNITS_PER_TILE;
  let hitEntityId: EntityId | null = null;
  let hitActorId: ActorId | null = null;

  outer: for (let k = 1; k <= range; k++) {
    const col = origin.col + dx * k;
    const row = origin.row + dz * k;
    const tile = rt.tileAt(col, row);
    const near = k * UNITS_PER_TILE - UNITS_PER_TILE / 2;
    if (tile.kind === 'wall' || tile.kind === 'pillar') {
      length = near;
      break;
    }
    if ((tile.kind === 'floor' && tile.h * 1000 > beamY) || (tile.kind === 'ramp' && (tile.h + 1) * 1000 > beamY)) {
      length = near;
      break;
    }
    for (const e of ctx.entitiesInCell(col, row)) {
      if (e.id === emitter.id) continue;
      const b = rt.behaviourFor(e.kind);
      const height = b.carriable ? PHYS.CRATE_HEIGHT : 2000;
      if (beamY < e.y || beamY >= e.y + height) continue;
      const eDef = rt.def(e.id);
      if (e.kind === 'laserReceiver') {
        length = k * UNITS_PER_TILE;
        hitEntityId = e.id;
        break outer;
      }
      const blocks = b.blocksLaser ? b.blocksLaser(e, eDef) : b.isSolid ? b.isSolid(e, eDef) : false;
      if (blocks) {
        length = b.carriable ? k * UNITS_PER_TILE - PHYS.CRATE_HALF : k * UNITS_PER_TILE;
        hitEntityId = e.id;
        break outer;
      }
    }
  }

  // Actors: exact intersection with the beam segment [emitter centre, length].
  const ox = origin.col * UNITS_PER_TILE + UNITS_PER_TILE / 2;
  const oz = origin.row * UNITS_PER_TILE + UNITS_PER_TILE / 2;
  for (const a of ctx.state.actors) {
    if (beamY < a.y || beamY > a.y + PHYS.ACTOR_HEIGHT) continue;
    const along = dx !== 0 ? (a.x - ox) * dx : (a.z - oz) * dz;
    const perp = dx !== 0 ? a.z - oz : a.x - ox;
    if (perp >= PHYS.ACTOR_HALF || perp <= -PHYS.ACTOR_HALF) continue;
    const face = along - PHYS.ACTOR_HALF;
    if (along <= 0 || face >= length) continue;
    length = face < 0 ? 0 : face;
    hitEntityId = null;
    hitActorId = a.id;
  }
  return { length, hitEntityId, hitActorId };
}

/**
 * Laser emitter — a solid projector facing def.facing. Emits while its combined input is powered; unwired it
 * emits when config.startsOn !== false. The beam is re-traced every tick (traceBeam) and its result stored in
 * state (beamLength / hitEntityId / hitActorId) for receivers and renderers. Output: emitting.
 * Events: laserOn / laserOff.
 */
export const laserEmitterBehaviour: PuzzleEntityBehaviour<'laserEmitter'> = {
  kind: 'laserEmitter',
  reset: () => ({ on: false, beamLength: 0, hitEntityId: null, hitActorId: null }),
  isSolid: () => true,
  blocksLaser: () => true,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const powered = ctx.inputsPowered(e.id);
    const on = powered ?? ctx.config.startsOn !== false;
    if (on !== s.on) ctx.emit({ type: on ? 'laserOn' : 'laserOff', tick: ctx.tick, entityId: e.id });
    s.on = on;
    if (on) {
      const t = traceBeam(ctx, e);
      s.beamLength = t.length;
      s.hitEntityId = t.hitEntityId;
      s.hitActorId = t.hitActorId;
    } else {
      s.beamLength = 0;
      s.hitEntityId = null;
      s.hitActorId = null;
    }
    ctx.setOutput(on);
  },
};

/** The first emitter (id order) whose beam currently terminates on `receiverId`, or null. */
function emittersHitting(ctx: SimContext, receiverId: EntityId): EntityId | null {
  for (const id of ctx.runtime.entityOrder) {
    const e = ctx.state.entities[id];
    if (e && e.kind === 'laserEmitter' && e.state.on && e.state.hitEntityId === receiverId) return id;
  }
  return null;
}

/**
 * Laser receiver — a solid lens on a pedestal; lit while any emitter's beam terminates on it (from any side).
 * Reads emitter state, so latency is 0 ticks when the emitter's id sorts before the receiver's and 1 tick
 * otherwise (deterministic either way). Output: lit. Events: receiverLit / receiverUnlit.
 */
export const laserReceiverBehaviour: PuzzleEntityBehaviour<'laserReceiver'> = {
  kind: 'laserReceiver',
  reset: () => ({ lit: false, litBy: null, litTicks: 0 }),
  isSolid: () => true,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const by = emittersHitting(ctx, e.id);
    const lit = by !== null;
    if (lit !== s.lit) ctx.emit({ type: lit ? 'receiverLit' : 'receiverUnlit', tick: ctx.tick, entityId: e.id });
    s.lit = lit;
    s.litBy = by;
    s.litTicks = lit ? Math.min(s.litTicks + 1, 1_000_000) : 0;
    ctx.setOutput(lit);
  },
};

/** Exposed for renderers/tests that want the beam's end point in units. */
export function beamEnd(emitter: { x: number; z: number }, facing: number, length: number): { x: number; z: number } {
  const c = { col: fdiv(emitter.x, UNITS_PER_TILE), row: fdiv(emitter.z, UNITS_PER_TILE) };
  return {
    x: c.col * UNITS_PER_TILE + UNITS_PER_TILE / 2 + (DIR4_DX[facing] ?? 0) * length,
    z: c.row * UNITS_PER_TILE + UNITS_PER_TILE / 2 + (DIR4_DZ[facing] ?? 0) * length,
  };
}
