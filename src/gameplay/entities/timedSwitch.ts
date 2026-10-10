import { SIM_HZ, type InteractContext, type InteractionResult, type PuzzleEntityBehaviour } from '../../engine/contracts';

/**
 * Timed switch — a solid console. E (or Space) while facing it switches it ON for config.durationTicks ticks,
 * then it switches itself off.
 *  - Output is true for exactly `durationTicks` consecutive entity updates, starting on the activation tick
 *    (wired consumers see it one tick later, per the double-buffered signal rule).
 *  - Pressing while ON restarts the timer when config.retrigger !== false ('use'); otherwise the press fails
 *    with reason 'busy' (a replayed press that meets a different switch state is therefore a divergence).
 *  - config.cooldownTicks (level-design addition): after switching off the switch is locked for that many
 *    ticks (state.cooldown counts down); presses fail with reason 'cooldown'. Prevents holding a switch on by
 *    mashing E, so its window is a real timing resource.
 *  - Events: switchOn (with the activating actor), switchTick once per remaining second, switchOff.
 */
function activate(ctx: InteractContext<'timedSwitch'>): InteractionResult {
  const e = ctx.entity;
  const s = e.state;
  const duration = Math.max(1, ctx.config.durationTicks);
  if (s.on && ctx.config.retrigger === false) return { kind: 'fail', entityId: e.id, reason: 'busy' };
  if (!s.on && (s.cooldown ?? 0) > 0) return { kind: 'fail', entityId: e.id, reason: 'cooldown' };
  const wasOn = s.on;
  s.on = true;
  s.remainingTicks = duration;
  s.activatedBy = ctx.actor.id;
  if (!wasOn) ctx.emit({ type: 'switchOn', tick: ctx.tick, entityId: e.id, actorId: ctx.actor.id });
  return { kind: 'use', entityId: e.id };
}

export const timedSwitchBehaviour: PuzzleEntityBehaviour<'timedSwitch'> = {
  kind: 'timedSwitch',
  reset: (def) =>
    (def.config.cooldownTicks ?? 0) > 0
      ? { on: false, remainingTicks: 0, activatedBy: null, cooldown: 0 }
      : { on: false, remainingTicks: 0, activatedBy: null },
  isSolid: () => true,
  blocksLaser: () => true,
  interact: activate,
  action: activate,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    if (!s.on) {
      if ((s.cooldown ?? 0) > 0) s.cooldown = (s.cooldown ?? 0) - 1;
      ctx.setOutput(false);
      return;
    }
    ctx.setOutput(true);
    s.remainingTicks -= 1;
    if (s.remainingTicks <= 0) {
      s.remainingTicks = 0;
      s.on = false;
      s.activatedBy = null;
      if ((ctx.config.cooldownTicks ?? 0) > 0) s.cooldown = Math.floor(ctx.config.cooldownTicks ?? 0);
      ctx.emit({ type: 'switchOff', tick: ctx.tick, entityId: e.id });
    } else if (s.remainingTicks % SIM_HZ === 0) {
      ctx.emit({ type: 'switchTick', tick: ctx.tick, entityId: e.id, remainingTicks: s.remainingTicks });
    }
  },
};
