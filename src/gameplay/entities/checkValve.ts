import {
  CHECK_VALVE_PHASE_CAP,
  DIR4_DX,
  DIR4_DZ,
  HALF_TILE,
  PHYS,
  UNITS_PER_TILE,
  type ActorState,
  type Dir4,
  type PuzzleEntityBehaviour,
  type SimEntity,
} from '../../engine/contracts';
import { entityCell } from './common';

/**
 * CHECK VALVE (round 6) — a one-way ratchet doorway across one corridor cell. `def.facing` is the direction of travel
 * that may pass ("downstream"). With config.reverseWhenPowered and wired inputs the allowed direction is reversed
 * while the combined input is powered (previous-tick buffer, 1 tick latency); otherwise it never changes.
 *
 * Solidity (isSolidFor, the existing per-actor hook; no engine change). With (cx,cz) the cell centre, (ax,az) the
 * actor centre and (ux,uz) the unit vector of state.dir:
 *     along   = (ax-cx)*ux + (az-cz)*uz            lateral = |(ax-cx)*uz - (az-cz)*ux|
 *     solid for the actor  iff  along >= HALF_TILE (centre beyond the downstream edge)  or  lateral >= HALF_TILE.
 * Because collision ignores blockers the actor already overlaps before a move, anyone whose footprint still touches
 * the cell can move either way; a body commits only once its footprint fully leaves the downstream side. A direction
 * flip mid-crossing therefore never traps or crushes anyone (no 'held' exception needed), and carry moves (decks,
 * lifts) use the same predicate, so nobody is ferried upstream. Players, echoes and recursion copies are treated
 * identically: an echo replaying into the closed face just pushes and stays put (positional, never a divergence).
 *
 * isSolid (item drops, resting crates, the non-actor default) = true: nothing can be dropped into the cell; carried
 * items pass with their carrier. Lasers pass (grille). Not carriable, no interaction. Output: always false.
 * Events (feedback only, never hashed): entity valvePass {actorId} when an actor's centre crosses the cell centre
 * downstream, entity valveDenied {actorId} once per contact when an actor walks into the closed (downstream) face,
 * entity valveFlip on a direction change.
 */

export function oppositeDir(d: Dir4): Dir4 {
  return ((d + 2) & 3) as Dir4;
}

/** Signed along / absolute lateral offset of a point from the valve cell centre for direction `dir`. */
export function valveAxes(e: { x: number; z: number }, dir: Dir4, x: number, z: number): { along: number; lateral: number } {
  const { col, row } = entityCell(e);
  const cx = col * UNITS_PER_TILE + HALF_TILE;
  const cz = row * UNITS_PER_TILE + HALF_TILE;
  const ux = DIR4_DX[dir] ?? 0;
  const uz = DIR4_DZ[dir] ?? 0;
  const dx = x - cx;
  const dz = z - cz;
  const lat = dx * uz - dz * ux;
  return { along: dx * ux + dz * uz, lateral: lat < 0 ? -lat : lat };
}

export function valveSolidFor(e: SimEntity<'checkValve'>, actor: Pick<ActorState, 'x' | 'z'>): boolean {
  const { along, lateral } = valveAxes(e, e.state.dir, actor.x, actor.z);
  return along >= HALF_TILE || lateral >= HALF_TILE;
}

/** Distance (units) between a flush body's centre and the valve's downstream edge: HALF_TILE + ACTOR_HALF. */
const FLUSH = HALF_TILE + PHYS.ACTOR_HALF;
/** Contact band in front of the closed face (a pushing actor stops exactly at FLUSH). */
const CONTACT_BAND = 2;

export const checkValveBehaviour: PuzzleEntityBehaviour<'checkValve'> = {
  kind: 'checkValve',
  reset: (def) => ({ dir: (def.facing ?? 0) as Dir4, phaseTicks: 0 }),
  initialOutput: () => false,
  isSolid: () => true,
  isSolidFor: (e, _def, actor) => valveSolidFor(e, actor),
  blocksLaser: () => false,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const facing = (ctx.def.facing ?? 0) as Dir4;
    let dir = facing;
    if (ctx.config.reverseWhenPowered === true) {
      const p = ctx.inputsPowered(e.id);
      if (p === true) dir = oppositeDir(facing);
    }
    if (dir !== s.dir) {
      s.dir = dir;
      s.phaseTicks = 0;
      ctx.emit({ type: 'entity', tick: ctx.tick, name: 'valveFlip', entityId: e.id });
    } else if (s.phaseTicks < CHECK_VALVE_PHASE_CAP) {
      s.phaseTicks += 1;
    }
    // Cosmetic feedback only: derived from positions and this tick's displacement, never stored.
    for (const a of ctx.state.actors) {
      const dy = a.y - e.y;
      if (dy >= 1000 || dy <= -1000) continue;
      const now = valveAxes(e, s.dir, a.x, a.z);
      if (now.lateral >= HALF_TILE) continue;
      const before = valveAxes(e, s.dir, a.x - a.vx, a.z - a.vz);
      if (before.along < 0 && now.along >= 0 && before.lateral < HALF_TILE)
        ctx.emit({ type: 'entity', tick: ctx.tick, name: 'valvePass', entityId: e.id, actorId: a.id });
      else if (now.along >= FLUSH && now.along <= FLUSH + CONTACT_BAND && before.along > FLUSH + CONTACT_BAND)
        ctx.emit({ type: 'entity', tick: ctx.tick, name: 'valveDenied', entityId: e.id, actorId: a.id });
    }
    ctx.setOutput(false);
  },
};
