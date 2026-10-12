import { CHRONO_RELAY_MAX_DELAY, CHRONO_RELAY_MIN_DELAY, type PuzzleEntityBehaviour } from '../../engine/contracts';

/**
 * CHRONO RELAY ("Echo Line", round 6) — a delayed signal. Its wired inputs (combined with def.logic, per-wire invert as
 * everywhere) are replayed on its output exactly `delayTicks` later: the whole waveform, so a 2 s press arrives as a
 * 2 s pulse. Its output may itself be wired (inverted or not) to any consumer.
 *
 * State: { out, last, pending } where `pending` holds one COUNTDOWN per in-flight edge (strictly ascending integers).
 * update(), in this exact order:
 *   1. every countdown -= 1; while the first one is 0: drop it and toggle `out`;
 *   2. c = inputsPowered (previous-tick buffer, false when unwired); if c !== last: push delayTicks, last = c;
 *   3. setOutput(out).
 * Latency (contracts §9): a source that changes on tick s is read on s+1, the relay toggles on s+1+delayTicks and its
 * consumer reacts on s+2+delayTicks, i.e. exactly delayTicks + 1 ticks later than through a direct wire.
 * At most one push per tick and each countdown lives delayTicks ticks, so pending.length <= delayTicks. Countdowns
 * (not absolute ticks) make the state change every tick while a pulse is in flight, which keeps the solver's
 * quiescence fingerprint honest. `initialOn` sets both the tick-0 output and the assumed input history: with a source
 * that is off at tick 0 the relay falls after the delay.
 *
 * Body: not solid, not a laser blocker, not carriable, no interaction. May be anchored on a wall cell (decor-like
 * conduit) or on floor. Events (feedback only, never hashed or read): `entity relayArm` on every push, `entity
 * relayEmit` (value 1/0) on every output toggle.
 */
export function clampRelayDelay(d: number): number {
  const n = Math.floor(d);
  return n < CHRONO_RELAY_MIN_DELAY ? CHRONO_RELAY_MIN_DELAY : n > CHRONO_RELAY_MAX_DELAY ? CHRONO_RELAY_MAX_DELAY : n;
}

export const chronoRelayBehaviour: PuzzleEntityBehaviour<'chronoRelay'> = {
  kind: 'chronoRelay',
  reset: (def) => {
    const on = def.config.initialOn === true;
    return { out: on, last: on, pending: [] };
  },
  initialOutput: (_def, s) => s.out,
  isSolid: () => false,
  blocksLaser: () => false,
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const p = s.pending;
    for (let i = 0; i < p.length; i++) p[i] = (p[i] as number) - 1;
    while (p.length > 0 && p[0] === 0) {
      p.shift();
      s.out = !s.out;
      ctx.emit({ type: 'entity', tick: ctx.tick, name: 'relayEmit', entityId: e.id, value: s.out ? 1 : 0 });
    }
    const c = ctx.inputsPowered(e.id) ?? false;
    if (c !== s.last) {
      p.push(clampRelayDelay(ctx.config.delayTicks));
      s.last = c;
      ctx.emit({ type: 'entity', tick: ctx.tick, name: 'relayArm', entityId: e.id });
    }
    ctx.setOutput(s.out);
  },
};
