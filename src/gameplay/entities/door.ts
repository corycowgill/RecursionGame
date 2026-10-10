import {
  DOOR_DEFAULT_OPEN_TICKS,
  DOOR_PASSABLE_PROGRESS,
  UNITS_PER_TILE,
  fdiv,
  idiv,
  type PuzzleEntityBehaviour,
} from '../../engine/contracts';

/**
 * Door — opens while its wired inputs are powered (inverted when config.startsOpen). Unwired doors keep their
 * initial state. Solid while progress < DOOR_PASSABLE_PROGRESS. A closing door never closes on an occupant:
 * while an actor or item overlaps the doorway its progress cannot decrease (state.blocked = true).
 * Output: passable (progress >= DOOR_PASSABLE_PROGRESS).
 */
export const doorBehaviour: PuzzleEntityBehaviour<'door'> = {
  kind: 'door',
  reset: (def) => {
    const open = def.config.startsOpen === true;
    return { open, progress: open ? 1000 : 0, blocked: false };
  },
  initialOutput: (_def, s) => s.progress >= DOOR_PASSABLE_PROGRESS,
  isSolid: (e) => e.state.progress < DOOR_PASSABLE_PROGRESS,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const startsOpen = ctx.config.startsOpen === true;
    const powered = ctx.inputsPowered(e.id);
    const wantOpen = powered === null ? startsOpen : startsOpen ? !powered : powered;
    if (wantOpen !== s.open) {
      s.open = wantOpen;
      ctx.emit({ type: wantOpen ? 'doorOpen' : 'doorClose', tick: ctx.tick, entityId: e.id });
    }
    const openTicks = Math.max(1, ctx.config.openTicks ?? DOOR_DEFAULT_OPEN_TICKS);
    const rate = idiv(1000 + openTicks - 1, openTicks);
    if (wantOpen) {
      s.progress = Math.min(1000, s.progress + rate);
      s.blocked = false;
    } else if (s.progress > 0) {
      const col = fdiv(e.x, UNITS_PER_TILE);
      const row = fdiv(e.z, UNITS_PER_TILE);
      const occupied =
        ctx.actorsOverlappingCell(col, row, e.y).length > 0 || ctx.entitiesInCell(col, row).some((o) => o.id !== e.id && ctx.runtime.behaviourFor(o.kind).carriable === true);
      if (occupied) {
        if (!s.blocked) ctx.emit({ type: 'doorBlocked', tick: ctx.tick, entityId: e.id });
        s.blocked = true;
      } else {
        s.blocked = false;
        s.progress = Math.max(0, s.progress - rate);
      }
    } else {
      s.blocked = false;
    }
    ctx.setOutput(s.progress >= DOOR_PASSABLE_PROGRESS);
  },
};
