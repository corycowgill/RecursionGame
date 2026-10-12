import { UNITS_PER_TILE, fdiv, type PuzzleEntityBehaviour } from '../../engine/contracts';
import { actorMatchesClass } from './common';

/**
 * Pressure plate — pressed while (actors on the cell + resting weighted items) >= threshold.
 * Output: pressed. Events: plateDown / plateUp.
 *
 * Round 6 (additive optional config; absent fields keep the original code path and state shape byte-identical):
 *  - accepts 'player' | 'echoes' (Gold Seal / Echo Plate): only matching actors count, everyone else is ignored
 *    completely, and crates/cells never count (acceptsCrates is ignored). threshold counts matching bodies.
 *  - shatterOn 'player' | 'echoes' (Paradox Glass): the first tick an actor of that class stands on the plate
 *    (actorsOnCell: centre in the cell, feet within the step tolerance) the plate breaks for the rest of the pass:
 *    state.broken = true, one `entity shatter` event naming the first such actor in actor-array order, then
 *    pressed = false, occupants = 0, pressedTicks = 0 and output false every tick (latch ignored). `broken` exists in
 *    the state only when shatterOn is configured, and resets with every pass like all state.
 */
export const pressurePlateBehaviour: PuzzleEntityBehaviour<'pressurePlate'> = {
  kind: 'pressurePlate',
  reset: (def) =>
    def.config.shatterOn !== undefined
      ? { pressed: false, occupants: 0, pressedTicks: 0, broken: false }
      : { pressed: false, occupants: 0, pressedTicks: 0 },
  update(ctx) {
    const e = ctx.entity;
    const col = fdiv(e.x, UNITS_PER_TILE);
    const row = fdiv(e.z, UNITS_PER_TILE);
    const cfg = ctx.config;
    const wasPressed = e.state.pressed;
    if (cfg.shatterOn !== undefined) {
      if (e.state.broken !== true) {
        for (const a of ctx.actorsOnCell(col, row, e.y)) {
          if (!actorMatchesClass(a, cfg.shatterOn)) continue;
          e.state.broken = true;
          ctx.emit({ type: 'entity', tick: ctx.tick, name: 'shatter', entityId: e.id, actorId: a.id });
          break;
        }
      }
      if (e.state.broken === true) {
        e.state.pressed = false;
        e.state.occupants = 0;
        e.state.pressedTicks = 0;
        if (wasPressed) ctx.emit({ type: 'plateUp', tick: ctx.tick, entityId: e.id });
        ctx.setOutput(false);
        return;
      }
    }
    let occupants: number;
    if (cfg.accepts !== undefined && cfg.accepts !== 'all') {
      occupants = 0;
      for (const a of ctx.actorsOnCell(col, row, e.y)) if (actorMatchesClass(a, cfg.accepts)) occupants += 1;
    } else {
      occupants = ctx.actorsOnCell(col, row, e.y).length;
      if (cfg.acceptsCrates !== false) {
        for (const other of ctx.entitiesInCell(col, row)) {
          if (other.id === e.id) continue;
          const w = ctx.runtime.behaviourFor(other.kind).plateWeight ?? 0;
          occupants += w;
        }
      }
    }
    const threshold = cfg.threshold ?? 1;
    const pressed = (cfg.latch === true && wasPressed) || occupants >= threshold;
    e.state.occupants = occupants;
    e.state.pressed = pressed;
    e.state.pressedTicks = pressed ? Math.min(e.state.pressedTicks + 1, 1_000_000) : 0;
    if (pressed && !wasPressed) ctx.emit({ type: 'plateDown', tick: ctx.tick, entityId: e.id });
    if (!pressed && wasPressed) ctx.emit({ type: 'plateUp', tick: ctx.tick, entityId: e.id });
    ctx.setOutput(pressed);
  },
};
