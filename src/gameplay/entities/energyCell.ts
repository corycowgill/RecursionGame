import type { PuzzleEntityBehaviour } from '../../engine/contracts';
import { rideSurface, socketHolding } from './common';

/**
 * Energy cell — a small carriable power core.
 *  - Carry model like crates (E to pick up / drop), but NOT solid (actors walk over a resting cell) and too light
 *    to press pressure plates (plateWeight 0). It does not block lasers.
 *  - Insert: E while carrying it and facing an energy socket (the socket's acceptItem does the transfer).
 *  - A seated cell cannot be picked up directly; E on the socket extracts it (if the socket allows).
 *  - state.socketId mirrors the socket holding it (synced every tick for renderers; the authoritative link is
 *    the socket's state.cellId).
 *  - Output: true while seated in a socket.
 */
export const energyCellBehaviour: PuzzleEntityBehaviour<'energyCell'> = {
  kind: 'energyCell',
  carriable: true,
  plateWeight: 0,
  reset(def, ctx) {
    for (const id of ctx.runtime.entityOrder) {
      const d = ctx.runtime.def(id);
      if (d.kind === 'energySocket' && d.config.initialCell === def.id) return { socketId: id };
    }
    return { socketId: null };
  },
  initialOutput: (_def, s) => s.socketId !== null,
  canPickUp: (e, ctx) => socketHolding(ctx, e.id) === null,
  isSolid: () => false,
  blocksLaser: () => false,
  update(ctx) {
    const e = ctx.entity;
    e.state.socketId = e.carriedBy === null ? socketHolding(ctx, e.id) : null;
    if (e.state.socketId === null) rideSurface(ctx, e);
    ctx.setOutput(e.state.socketId !== null);
  },
};
