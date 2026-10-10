import { UNITS_PER_TILE, cellCenter, fdiv, type PuzzleEntityBehaviour, type SurfaceCell } from '../../engine/contracts';
import { clampStep } from './common';

/**
 * Moving platform — a one-tile deck that travels through config.path (cell waypoints, path[0] = its authored
 * cell) over void, carrying actors and resting items.
 *  - Motion: config.speed units/tick (default 20) toward the next waypoint, per axis; waits config.pauseTicks
 *    (default 30) at every waypoint, including at tick 0. mode 'pingpong' (default) reverses at the ends, 'loop'
 *    wraps from the last waypoint to the first.
 *  - Signal: when wired it only moves while its combined input is powered (it freezes in place otherwise); with
 *    config.requiresSignal and no wires it never moves.
 *  - Surface: exactly the deck's real 1x1 extent [x-500, x+500) x [z-500, z+500) is walkable at the deck height.
 *    While it straddles two cells it reports both, each clipped to that extent (SurfaceCell.clip), so the half of a
 *    cell the deck has already left is void again (QA-1: it used to stay walkable and left riders over the pit).
 *    Riders (actors whose centre is on the deck) are carried by state.dx/dz in the same tick the deck moves
 *    (carrierDelta, engine carry phase, collision-checked); they can neither step onto the uncovered part of a
 *    straddled cell nor be left on it.
 *  - Output: docked (resting at a waypoint). Events: platformDepart / platformArrive.
 */
export const movingPlatformBehaviour: PuzzleEntityBehaviour<'movingPlatform'> = {
  kind: 'movingPlatform',
  reset: (def) => ({
    targetIndex: def.config.path.length > 1 ? 1 : 0,
    direction: 1,
    waitTicks: def.config.pauseTicks ?? 30,
    dx: 0,
    dz: 0,
  }),
  initialOutput: () => true,
  surfaceCells: (e) => {
    const h = UNITS_PER_TILE / 2;
    const c0 = fdiv(e.x - h, UNITS_PER_TILE);
    const c1 = fdiv(e.x + h - 1, UNITS_PER_TILE);
    const r0 = fdiv(e.z - h, UNITS_PER_TILE);
    const r1 = fdiv(e.z + h - 1, UNITS_PER_TILE);
    const docked = c0 === c1 && r0 === r1;
    const out: SurfaceCell[] = [];
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++)
        out.push(docked ? { col, row, y: e.y } : { col, row, y: e.y, clip: { minX: e.x - h, maxX: e.x + h, minZ: e.z - h, maxZ: e.z + h } });
    return out;
  },
  carrierDelta: (e) => (e.state.dx !== 0 || e.state.dz !== 0 ? { dx: e.state.dx, dy: 0, dz: e.state.dz } : null),
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const cfg = ctx.config;
    const path = cfg.path;
    const wasMoving = s.dx !== 0 || s.dz !== 0;
    s.dx = 0;
    s.dz = 0;
    const powered = ctx.inputsPowered(e.id);
    const enabled = powered === null ? cfg.requiresSignal !== true : powered;
    if (!enabled || path.length < 2) {
      ctx.setOutput(isDocked(e.x, e.z, path));
      return;
    }
    if (s.waitTicks > 0) {
      s.waitTicks -= 1;
      ctx.setOutput(true);
      return;
    }
    const wp = path[s.targetIndex] ?? path[0];
    if (!wp) return;
    const t = cellCenter(wp.col, wp.row);
    const speed = Math.max(1, cfg.speed ?? 20);
    s.dx = clampStep(t.x - e.x, speed);
    s.dz = clampStep(t.z - e.z, speed);
    e.x += s.dx;
    e.z += s.dz;
    if (!wasMoving && (s.dx !== 0 || s.dz !== 0)) ctx.emit({ type: 'platformDepart', tick: ctx.tick, entityId: e.id });
    if (e.x === t.x && e.z === t.z) {
      ctx.emit({ type: 'platformArrive', tick: ctx.tick, entityId: e.id });
      s.waitTicks = Math.max(0, cfg.pauseTicks ?? 30);
      if ((cfg.mode ?? 'pingpong') === 'loop') {
        s.targetIndex = (s.targetIndex + 1) % path.length;
      } else {
        let next = s.targetIndex + s.direction;
        if (next < 0 || next >= path.length) {
          s.direction = s.direction === 1 ? -1 : 1;
          next = s.targetIndex + s.direction;
        }
        s.targetIndex = next;
      }
      ctx.setOutput(true);
      return;
    }
    ctx.setOutput(false);
  },
};

function isDocked(x: number, z: number, path: readonly { col: number; row: number }[]): boolean {
  for (const p of path) {
    const c = cellCenter(p.col, p.row);
    if (c.x === x && c.z === z) return true;
  }
  return false;
}
