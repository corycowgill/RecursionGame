import { SIM_HZ, type InteractContext, type InteractionResult, type PuzzleEntityBehaviour, type TimedSwitchState } from '../../engine/contracts';
import { actorMatchesClass } from './common';

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
 *  - Round 6 (additive optional config; absent = the original code path and state shape, byte-identical):
 *    config.shatterOn (Paradox Glass): a press by an actor of that class fails with reason 'shattered' and breaks
 *    the console for the rest of the pass (state.broken = true, on = false, remainingTicks = 0, one `entity shatter`
 *    event); every later press fails 'shattered' and the output stays false. config.accepts (Attuned Devices: gold
 *    'player' / cyan 'echoes'): a press by a non-matching actor fails with reason 'attuned' and changes nothing.
 *    Check order: broken -> shatterOn -> accepts -> busy / cooldown. A live press on an Echo Console fails while
 *    recording and the same input succeeds on replay: the intended fail->use divergence (recorded reason 'attuned').
 */
function activate(ctx: InteractContext<'timedSwitch'>): InteractionResult {
  const e = ctx.entity;
  const s = e.state;
  const duration = Math.max(1, ctx.config.durationTicks);
  if (ctx.config.shatterOn !== undefined) {
    if (s.broken === true) return { kind: 'fail', entityId: e.id, reason: 'shattered' };
    if (actorMatchesClass(ctx.actor, ctx.config.shatterOn)) {
      const wasOn = s.on;
      s.broken = true;
      s.on = false;
      s.remainingTicks = 0;
      s.activatedBy = null;
      ctx.emit({ type: 'entity', tick: ctx.tick, name: 'shatter', entityId: e.id, actorId: ctx.actor.id });
      if (wasOn) ctx.emit({ type: 'switchOff', tick: ctx.tick, entityId: e.id });
      return { kind: 'fail', entityId: e.id, reason: 'shattered' };
    }
  }
  if (ctx.config.accepts !== undefined && !actorMatchesClass(ctx.actor, ctx.config.accepts))
    return { kind: 'fail', entityId: e.id, reason: 'attuned' };
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
  reset: (def) => {
    const s: TimedSwitchState =
      (def.config.cooldownTicks ?? 0) > 0
        ? { on: false, remainingTicks: 0, activatedBy: null, cooldown: 0 }
        : { on: false, remainingTicks: 0, activatedBy: null };
    if (def.config.shatterOn !== undefined) s.broken = false;
    return s;
  },
  isSolid: () => true,
  blocksLaser: () => true,
  interact: activate,
  action: activate,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    if (s.broken === true) {
      ctx.setOutput(false);
      return;
    }
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
