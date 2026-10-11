import type { ActorState, EntityDefinitionOf, PuzzleEntityBehaviour, SimEntity } from '../../engine/contracts';
import { entityCell } from './common';

/**
 * Temporal gate — a shimmering field across one cell that filters actors by TIMELINE, not by body:
 *  - allows 'echoes': only echoes (past selves) pass; the live player is blocked. To get something through,
 *    record a loop that walks into the field — on replay your echo passes where you could not.
 *  - allows 'player': only the live player passes; echoes are blocked (a recording that walked through it
 *    will be stopped when replayed).
 *  - allows 'all'  : everyone passes (useful as a powered barrier together with wires).
 * Signal: when wired (and config.requiresSignal !== false) the gate is OPEN only while its combined input is
 * powered; while closed it blocks EVERYONE. Unwired gates are always open.
 * Items: carried items pass with their carrier; nothing can be dropped into the field (isSolid for drops).
 * Occupants (QA-2): a gate never closes on an actor. While it should close but any actor's footprint overlaps its
 * cell (within one height level), it stays OPEN — like a door held by an occupant — and closes on the first tick
 * the cell is clear. (While open it only admits the actors `allows` lets through, so an occupant is always one it
 * admitted.) A held gate keeps reporting open on its output.
 * Lasers pass through the field. Output: open. Events: gateOpen / gateClose, and gateBlocked (once, when an occupant
 * starts holding a gate open that wants to close — mirrors doorBlocked). `state.held` records that hold for the
 * event edge and the renderer; it is feedback only and is excluded from the hash (serialize), so recordings,
 * golden replays and hashes are unaffected.
 */
function isOpenFor(e: SimEntity<'temporalGate'>, def: EntityDefinitionOf<'temporalGate'>, actor: ActorState): boolean {
  if (!e.state.open) return false;
  switch (def.config.allows) {
    case 'echoes':
      return actor.kind === 'echo';
    case 'player':
      return actor.kind === 'player';
    default:
      return true;
  }
}

export const temporalGateBehaviour: PuzzleEntityBehaviour<'temporalGate'> = {
  kind: 'temporalGate',
  reset: (def, ctx) => ({
    open: ctx.runtime.inputsOf(def.id).length === 0 || def.config.requiresSignal === false,
    phaseTicks: 0,
  }),
  initialOutput: (_def, s) => s.open,
  // Hash exactly the pre-round-4 shape: `held` is render/audio feedback only (never read by gameplay).
  serialize: (s) => ({ open: s.open, phaseTicks: s.phaseTicks }),
  isSolid: () => true,
  isSolidFor: (e, def, actor) => !isOpenFor(e, def, actor),
  blocksLaser: () => false,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const powered = ctx.inputsPowered(e.id);
    let open = powered === null || ctx.config.requiresSignal === false ? true : powered;
    let held = false;
    if (!open && s.open) {
      const { col, row } = entityCell(e);
      if (ctx.actorsOverlappingCell(col, row, e.y).length > 0) {
        open = true; // held open by an occupant
        held = true;
      }
    }
    if (held && s.held !== true) ctx.emit({ type: 'gateBlocked', tick: ctx.tick, entityId: e.id });
    if (held || s.held !== undefined) s.held = held;
    if (open !== s.open) {
      ctx.emit({ type: open ? 'gateOpen' : 'gateClose', tick: ctx.tick, entityId: e.id });
      s.open = open;
      s.phaseTicks = 0;
    } else {
      s.phaseTicks = Math.min(s.phaseTicks + 1, 1_000_000);
    }
    ctx.setOutput(open);
  },
};
