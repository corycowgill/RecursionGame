import type { PuzzleEntityBehaviour } from '../../engine/contracts';
import { entityCell } from './common';

/**
 * Energy socket (receptacle) — a solid pedestal that is powered while it holds an energy cell.
 *  - Insert: E while carrying an energy cell and facing the socket -> 'insert' (cell anchored on the socket).
 *    Fails with 'occupied' if it already holds a cell, 'rejected' if the cell's tag does not match
 *    config.requiresTag. Carrying anything else falls through to a normal drop (which fails: the socket is solid).
 *  - Extract: E empty-handed while facing it -> 'extract' (cell goes to the actor's hands). 'fail'/'locked' when
 *    config.allowExtract === false. An empty socket is not interactable ('none').
 *  - config.initialCell: a cell seated at tick 0 — author that cell entity on the SAME cell as the socket.
 *  - Output: powered (holds a cell whose tag matches). Events: cellInserted / cellRemoved.
 *  - Interaction outcomes record the SOCKET id (so a replayed insert into another socket is a divergence).
 */
export const energySocketBehaviour: PuzzleEntityBehaviour<'energySocket'> = {
  kind: 'energySocket',
  reset(def) {
    const cellId = def.config.initialCell ?? null;
    return { cellId, powered: cellId !== null };
  },
  initialOutput: (_def, s) => s.powered,
  isSolid: () => true,
  blocksLaser: () => true,
  interact(ctx) {
    const s = ctx.entity.state;
    if (s.cellId === null) return null;
    if (ctx.config.allowExtract === false) return { kind: 'fail', entityId: ctx.entity.id, reason: 'locked' };
    const cellId = s.cellId;
    if (!ctx.giveItemToActor(cellId)) return { kind: 'fail', entityId: ctx.entity.id, reason: 'blocked' };
    s.cellId = null;
    s.powered = false;
    ctx.emit({ type: 'cellRemoved', tick: ctx.tick, entityId: ctx.entity.id, cellId, actorId: ctx.actor.id });
    return { kind: 'extract', entityId: ctx.entity.id };
  },
  acceptItem(ctx) {
    const item = ctx.item;
    if (!item || item.kind !== 'energyCell') return null;
    const e = ctx.entity;
    if (e.state.cellId !== null) return { kind: 'fail', entityId: e.id, reason: 'occupied' };
    const need = ctx.config.requiresTag;
    if (need !== undefined) {
      const d = ctx.runtime.def(item.id);
      if (d.kind !== 'energyCell' || d.config.tag !== need) return { kind: 'fail', entityId: e.id, reason: 'rejected' };
    }
    ctx.releaseItemTo(e.x, e.y, e.z);
    e.state.cellId = item.id;
    ctx.emit({ type: 'cellInserted', tick: ctx.tick, entityId: e.id, cellId: item.id, actorId: ctx.actor.id });
    return { kind: 'insert', entityId: e.id };
  },
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    if (s.cellId !== null) {
      // Robustness: drop a stale link if the cell is no longer seated here.
      const cell = ctx.getEntity(s.cellId);
      const here = entityCell(e);
      const at = cell ? entityCell(cell) : null;
      if (!cell || cell.carriedBy !== null || !at || at.col !== here.col || at.row !== here.row) {
        ctx.emit({ type: 'cellRemoved', tick: ctx.tick, entityId: e.id, cellId: s.cellId, actorId: null });
        s.cellId = null;
      }
    }
    let powered = s.cellId !== null;
    const need = ctx.config.requiresTag;
    if (powered && need !== undefined && s.cellId !== null) {
      const d = ctx.runtime.def(s.cellId);
      powered = d.kind === 'energyCell' && d.config.tag === need;
    }
    s.powered = powered;
    ctx.setOutput(powered);
  },
};
