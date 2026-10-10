import type { PuzzleEntityBehaviour } from '../../engine/contracts';

/**
 * Crate — CARRY model: E picks it up (exclusive ownership), E again drops it cell-snapped on the faced cell.
 * Solid when resting; weighs 1 on pressure plates. Never pushed.
 */
export const crateBehaviour: PuzzleEntityBehaviour<'crate'> = {
  kind: 'crate',
  carriable: true,
  plateWeight: 1,
  reset: () => ({ restTicks: 0 }),
  isSolid: () => true,
  blocksLaser: () => true,
  update(ctx) {
    const e = ctx.entity;
    e.state.restTicks = e.carriedBy === null ? Math.min(e.state.restTicks + 1, 3600) : 0;
  },
};
