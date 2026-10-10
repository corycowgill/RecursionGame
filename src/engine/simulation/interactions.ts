import {
  DIR4_DX,
  DIR4_DZ,
  PHYS,
  UNITS_PER_TILE,
  cellCenter,
  fdiv,
  type ActorState,
  type AnySimEntity,
  type InteractionResult,
  type RecordedInteraction,
} from '../contracts';
import { footprintOverlapsActor } from '../physics/collision';
import { buildSurfaceOverrides, cellSurfaceY, isFlatCell } from '../physics/terrain';
import type { OwnershipOps, TickContext } from './context';

/**
 * CENTRAL INTERACTION & OWNERSHIP SYSTEM
 *
 * Ownership: an actor carries at most one entity; an entity is carried by at most one actor.
 * ActorState.carrying and SimEntity.carriedBy always mirror each other; only this module (and the
 * InteractContext helpers it provides) changes them.
 *
 * Resolution (per actor, actors processed in SimState.actors order = echoes by index, then the player; the
 * first actor to act on a contested entity in a tick wins, later actors see the updated world):
 *   probe cell = cell containing (actor centre + facing * PHYS.REACH)
 *   candidates = uncarried entities anchored in the probe cell (id order), then in the actor's own cell
 *                (id order), limited to |entity.y - actor.y| < 1000.
 *   verb 'action' (Space):  first candidate whose behaviour.action returns non-null; else 'none'.
 *   verb 'interact' (E):
 *     carrying an item -> first candidate whose acceptItem returns non-null (e.g. socket takes cell);
 *                         else DROP the item onto the probe cell (see tryDrop); fail if impossible.
 *     empty-handed     -> for each candidate: behaviour.interact (non-null wins); else if carriable and
 *                         canPickUp -> PICKUP. No candidate -> 'none'.
 */

export function probeCell(actor: ActorState): { col: number; row: number } {
  const px = actor.x + (DIR4_DX[actor.facing] ?? 0) * PHYS.REACH;
  const pz = actor.z + (DIR4_DZ[actor.facing] ?? 0) * PHYS.REACH;
  return { col: fdiv(px, UNITS_PER_TILE), row: fdiv(pz, UNITS_PER_TILE) };
}

export function interactionCandidates(ctx: TickContext, actor: ActorState): AnySimEntity[] {
  const probe = probeCell(actor);
  const own = { col: fdiv(actor.x, UNITS_PER_TILE), row: fdiv(actor.z, UNITS_PER_TILE) };
  const out: AnySimEntity[] = [];
  const near = (e: AnySimEntity): boolean => {
    const d = e.y - actor.y;
    return d < 1000 && d > -1000;
  };
  for (const e of ctx.entitiesInCell(probe.col, probe.row)) if (near(e)) out.push(e);
  if (own.col !== probe.col || own.row !== probe.row) {
    for (const e of ctx.entitiesInCell(own.col, own.row)) if (near(e)) out.push(e);
  }
  return out;
}

export function makeOwnershipOps(ctx: TickContext): OwnershipOps {
  return {
    release(actor, x, y, z) {
      if (actor.carrying === null) throw new Error(`Ownership violation: ${actor.id} releases nothing`);
      const item = ctx.state.entities[actor.carrying];
      if (!item || item.carriedBy !== actor.id) throw new Error(`Ownership desync for ${actor.id}`);
      item.carriedBy = null;
      item.x = x;
      item.y = y;
      item.z = z;
      actor.carrying = null;
      return item;
    },
    give(actor, entityId) {
      const e = ctx.state.entities[entityId];
      if (!e || e.carriedBy !== null || actor.carrying !== null) return false;
      const b = ctx.runtime.behaviourFor(e.kind);
      if (!b.carriable) return false;
      e.carriedBy = actor.id;
      actor.carrying = e.id;
      attachToCarrier(e, actor);
      return true;
    },
  };
}

/** Positions a carried entity relative to its carrier. */
export function attachToCarrier(e: AnySimEntity, actor: ActorState): void {
  e.x = actor.x;
  e.z = actor.z;
  e.y = actor.y + PHYS.CARRY_HEIGHT;
}

function pickup(ctx: TickContext, actor: ActorState, e: AnySimEntity): InteractionResult {
  if (e.carriedBy !== null) return { kind: 'fail', entityId: e.id, reason: 'carriedByOther' };
  if (actor.carrying !== null) return { kind: 'fail', entityId: e.id, reason: 'handsFull' };
  e.carriedBy = actor.id;
  actor.carrying = e.id;
  attachToCarrier(e, actor);
  ctx.emit({ type: 'pickup', tick: ctx.tick, actorId: actor.id, entityId: e.id, entityKind: e.kind });
  return { kind: 'pickup', entityId: e.id };
}

/**
 * Drop rules: the probe cell must be a flat walkable surface within STEP_TOLERANCE of the actor's height,
 * contain no solid or carriable entity, and the item footprint must not overlap any actor (including the
 * carrier — step back first). The item is placed at the cell centre (cell-snapped).
 */
export function tryDrop(ctx: TickContext, actor: ActorState, item: AnySimEntity, ops: OwnershipOps): InteractionResult {
  const { col, row } = probeCell(actor);
  const rt = ctx.runtime;
  const overrides = buildSurfaceOverrides(rt, ctx.state);
  const sy = cellSurfaceY(rt, overrides, col, row);
  if (sy === null || !isFlatCell(rt, overrides, col, row)) return { kind: 'fail', entityId: item.id, reason: 'blocked' };
  const dy = sy - actor.y;
  if (dy > PHYS.STEP_TOLERANCE || dy < -PHYS.STEP_TOLERANCE) return { kind: 'fail', entityId: item.id, reason: 'blocked' };
  for (const other of ctx.entitiesInCell(col, row)) {
    const b = rt.behaviourFor(other.kind);
    if (b.carriable || (b.isSolid && b.isSolid(other, rt.def(other.id))))
      return { kind: 'fail', entityId: item.id, reason: 'occupied' };
  }
  const c = cellCenter(col, row);
  for (const a of ctx.state.actors) {
    const ady = a.y - sy;
    if (ady >= 1000 || ady <= -1000) continue;
    if (footprintOverlapsActor(a, c.x, c.z, PHYS.CRATE_HALF)) return { kind: 'fail', entityId: item.id, reason: 'blocked' };
  }
  ops.release(actor, c.x, sy, c.z);
  ctx.emit({ type: 'drop', tick: ctx.tick, actorId: actor.id, entityId: item.id, entityKind: item.kind });
  return { kind: 'drop', entityId: item.id };
}

/** Resolves one interaction attempt and returns its outcome (also emits events). */
export function resolveInteraction(ctx: TickContext, actor: ActorState, verb: 'interact' | 'action'): RecordedInteraction {
  const ops = makeOwnershipOps(ctx);
  const result = resolveInner(ctx, actor, verb, ops);
  const rec: RecordedInteraction = { tick: ctx.tick, verb, kind: result.kind, entityId: result.entityId };
  if (result.reason !== undefined) rec.reason = result.reason;
  if (result.kind === 'fail') {
    ctx.emit({
      type: 'interactFailed',
      tick: ctx.tick,
      actorId: actor.id,
      entityId: result.entityId,
      reason: result.reason ?? 'failed',
    });
  } else if (result.kind !== 'none' && result.kind !== 'pickup' && result.kind !== 'drop' && result.entityId !== null) {
    const e = ctx.state.entities[result.entityId];
    if (e)
      ctx.emit({ type: 'interact', tick: ctx.tick, actorId: actor.id, entityId: e.id, entityKind: e.kind, kind: result.kind });
  }
  actor.lastInteraction = rec;
  return rec;
}

function resolveInner(
  ctx: TickContext,
  actor: ActorState,
  verb: 'interact' | 'action',
  ops: OwnershipOps,
): InteractionResult {
  const rt = ctx.runtime;
  const candidates = interactionCandidates(ctx, actor);
  if (verb === 'action') {
    for (const e of candidates) {
      const b = rt.behaviourFor(e.kind);
      if (!b.action) continue;
      const r = b.action(ctx.forInteraction(e, actor, verb, ops));
      if (r) return r;
    }
    return { kind: 'none', entityId: null };
  }

  const item = actor.carrying !== null ? ctx.state.entities[actor.carrying] : undefined;
  if (item) {
    for (const e of candidates) {
      if (e.id === item.id) continue;
      const b = rt.behaviourFor(e.kind);
      if (!b.acceptItem) continue;
      const r = b.acceptItem(ctx.forInteraction(e, actor, verb, ops));
      if (r) return r;
    }
    return tryDrop(ctx, actor, item, ops);
  }

  for (const e of candidates) {
    const b = rt.behaviourFor(e.kind);
    if (b.interact) {
      const r = b.interact(ctx.forInteraction(e, actor, verb, ops));
      if (r) return r;
    }
    if (b.carriable && (b.canPickUp ? b.canPickUp(e, ctx) : true)) return pickup(ctx, actor, e);
  }
  return { kind: 'none', entityId: null };
}

/** Whether two outcomes count as "the same" for divergence detection. */
export function sameOutcome(a: RecordedInteraction, b: RecordedInteraction): boolean {
  return a.kind === b.kind && a.entityId === b.entityId;
}

