import type { LevelDefinition, SimEvent, SimView } from '../../engine/contracts';
import { formatTicks } from './model';

/**
 * ROUND-6 TIMELINE ADDITIONS — pure view-model math (no DOM), tested in devices.test.ts.
 *
 *  Chrono relay rows: a relay's state IS the recent history of its input. Its pending countdowns plus `last` encode the
 *  input waveform over the last delayTicks ticks ("the conduit remembers the last N seconds"), and the same waveform
 *  shifted by delayTicks + 1 is what its consumers will see. relayRow() turns that into:
 *    input   the input's ON spans (absolute ticks, within [tick - delay, tick])
 *    ghost   the same spans shifted forward by delay + 1 (what arrives at the target)
 *    arrivals one marker per in-flight edge, "arrives 12.4 s" (rising) / "ends 13.4 s" (falling)
 *  Shatter markers: coral markers on the track of the actor that broke a Paradox Glass device, collected from the event
 *  stream for the current pass.
 */

export interface RelaySpan {
  from: number;
  to: number;
}

export interface RelayArrival {
  /** Absolute tick at which the consumer sees the change (relay toggle + 1 hop). */
  tick: number;
  rising: boolean;
  label: string;
}

export interface RelayRowModel {
  id: string;
  label: string;
  delayTicks: number;
  input: RelaySpan[];
  ghost: RelaySpan[];
  arrivals: RelayArrival[];
}

/** Rows for every chrono relay in the level, from the current (or previewed) state. */
export function relayRows(level: LevelDefinition, view: SimView): RelayRowModel[] {
  const out: RelayRowModel[] = [];
  for (const def of level.entities) {
    if (def.kind !== 'chronoRelay') continue;
    const e = view.entities[def.id];
    if (!e || e.kind !== 'chronoRelay') continue;
    out.push(relayRow(def.id, def.label ?? `Echo Line - ${Math.round((def.config.delayTicks / 60) * 10) / 10} s`, def.config.delayTicks, view.tick, e.state));
  }
  return out;
}

/**
 * One relay row. `tick` = ticks simulated so far (the next tick to run). An in-flight countdown c (after this tick's
 * update) toggles the relay c ticks from the last update, i.e. at tick (tick - 1) + c; it was armed delayTicks earlier,
 * when the input changed. Consumers react one tick after the toggle.
 */
export function relayRow(id: string, label: string, delayTicks: number, tick: number, s: { out: boolean; last: boolean; pending: readonly number[] }): RelayRowModel {
  const now = tick - 1; // tick of the last update
  const d = Math.max(1, delayTicks);
  // input edges (absolute tick of the input change as seen by the relay), oldest first
  const edges = s.pending.map((c) => now + c - d);
  // the level before the oldest in-flight edge equals the current output
  const input: RelaySpan[] = [];
  let level = s.out;
  let from = Math.max(0, now - d);
  for (const t of edges) {
    if (level && t > from) input.push({ from, to: t });
    level = !level;
    from = Math.max(from, t);
  }
  // after the walk `level` equals s.last (the current input)
  if (level && tick > from) input.push({ from, to: tick });
  const shift = d + 1;
  const ghost = input.map((sp) => ({ from: sp.from + shift, to: sp.to + shift }));
  let rising = !s.out;
  const arrivals: RelayArrival[] = s.pending.map((c) => {
    const at = now + c + 1;
    const a: RelayArrival = { tick: at, rising, label: `${rising ? 'arrives' : 'ends'} ${formatTicks(at)}` };
    rising = !rising;
    return a;
  });
  return { id, label, delayTicks: d, input, ghost, arrivals };
}

export interface ShatterMarker {
  tick: number;
  actorId: string;
  entityId: string;
  title: string;
}

/**
 * Collects Paradox Glass shatter markers from drained events for the current pass (a rewind / restart / delete starts a
 * new pass and clears them). Returns the updated list (new array when it changed, the same one otherwise).
 */
export function collectShatters(prev: readonly ShatterMarker[], events: readonly SimEvent[], labelOf: (entityId: string) => string = (x) => x): readonly ShatterMarker[] {
  let out: ShatterMarker[] | null = null;
  for (const e of events) {
    if (e.type === 'rewind' || e.type === 'chamberRestart' || e.type === 'loopDeleted' || e.type === 'levelLoaded') {
      out = [];
      continue;
    }
    if (e.type === 'entity' && e.name === 'shatter' && e.actorId) {
      out ??= [...prev];
      out.push({ tick: e.tick, actorId: e.actorId, entityId: e.entityId, title: `${labelOf(e.entityId)} shattered at ${formatTicks(e.tick)}` });
    }
  }
  return out ?? prev;
}

/** Divergence with the RECORDED reason 'attuned' (Echo Console fail -> use): intended, drawn violet, not a paradox. */
export function isIntendedDivergence(d: { expected: { reason?: string } }): boolean {
  return d.expected.reason === 'attuned';
}
