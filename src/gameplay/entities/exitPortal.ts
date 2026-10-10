import type { PuzzleEntityBehaviour } from '../../engine/contracts';

/**
 * Exit portal — active when all wired inputs are powered (or always, when unwired). The engine completes the
 * level when the PLAYER stands on the portal cell while its output is true (echoes never complete a level).
 * Output: active.
 */
export const exitPortalBehaviour: PuzzleEntityBehaviour<'exitPortal'> = {
  kind: 'exitPortal',
  reset: (def, ctx) => ({ active: ctx.runtime.inputsOf(def.id).length === 0, activeTicks: 0 }),
  initialOutput: (_def, s) => s.active,
  update(ctx) {
    const e = ctx.entity;
    const active = ctx.inputsPowered(e.id) ?? true;
    if (active !== e.state.active) {
      ctx.emit({ type: active ? 'portalActivated' : 'portalDeactivated', tick: ctx.tick, entityId: e.id });
      e.state.active = active;
      e.state.activeTicks = 0;
    }
    if (active) e.state.activeTicks = Math.min(e.state.activeTicks + 1, 1_000_000);
    ctx.setOutput(active);
  },
};
