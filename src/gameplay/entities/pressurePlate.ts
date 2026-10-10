import { UNITS_PER_TILE, fdiv, type PuzzleEntityBehaviour } from '../../engine/contracts';

/**
 * Pressure plate — pressed while (actors on the cell + resting weighted items) >= threshold.
 * Output: pressed. Events: plateDown / plateUp.
 */
export const pressurePlateBehaviour: PuzzleEntityBehaviour<'pressurePlate'> = {
  kind: 'pressurePlate',
  reset: () => ({ pressed: false, occupants: 0, pressedTicks: 0 }),
  update(ctx) {
    const e = ctx.entity;
    const col = fdiv(e.x, UNITS_PER_TILE);
    const row = fdiv(e.z, UNITS_PER_TILE);
    let occupants = ctx.actorsOnCell(col, row, e.y).length;
    if (ctx.config.acceptsCrates !== false) {
      for (const other of ctx.entitiesInCell(col, row)) {
        if (other.id === e.id) continue;
        const w = ctx.runtime.behaviourFor(other.kind).plateWeight ?? 0;
        occupants += w;
      }
    }
    const threshold = ctx.config.threshold ?? 1;
    const wasPressed = e.state.pressed;
    const pressed = (ctx.config.latch === true && wasPressed) || occupants >= threshold;
    e.state.occupants = occupants;
    e.state.pressed = pressed;
    e.state.pressedTicks = pressed ? Math.min(e.state.pressedTicks + 1, 1_000_000) : 0;
    if (pressed && !wasPressed) ctx.emit({ type: 'plateDown', tick: ctx.tick, entityId: e.id });
    if (!pressed && wasPressed) ctx.emit({ type: 'plateUp', tick: ctx.tick, entityId: e.id });
    ctx.setOutput(pressed);
  },
};
