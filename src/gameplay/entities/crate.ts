import type { PuzzleEntityBehaviour } from '../../engine/contracts';
import { bump, rideSurface } from './common';

/**
 * Crate — CARRY model (never pushed): E picks it up (exclusive ownership), E again drops it cell-snapped on the
 * faced cell (see the central interaction system in src/engine/simulation/interactions.ts).
 *  - Solid while resting: blocks actors, item drops and laser beams. Weighs 1 on pressure plates.
 *  - Rides elevators and moving platforms it rests on.
 *  - state.restTicks: ticks since it was last put down (0 while carried) — renderers use it for settle bounce.
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
    if (e.carriedBy !== null) {
      e.state.restTicks = 0;
      return;
    }
    e.state.restTicks = bump(e.state.restTicks, 3600);
    rideSurface(ctx, e);
  },
};
