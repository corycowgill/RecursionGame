import { PHYS, UNITS_PER_TILE, fdiv, type LevelDefinition, type SimView } from '../../engine/contracts';

/**
 * ECHO FORECAST — presentation-side sampling of the echoes' *future* (pure, no Three.js).
 *
 * The temporal preview (hold Q) and the walk-on badges both need to know where each echo will be over the next
 * seconds. The only source of truth for that is the simulation itself: `TemporalGame.getSnapshotAt(t)` for a
 * future tick re-simulates the current pass with the echoes replaying and the player idle (the same assumption the
 * Q preview shows). This module samples those snapshots every `step` ticks into a compact list of echo positions
 * and derives from it:
 *
 *   - ghost paths   (`extractGhostPaths`)  polyline + 1 s tick markers per echo, for the Q-preview trails
 *   - walk-on plan  (`scheduleWalkOns`)    which echo will stand on which pressure plate / ride-lift, and when
 *
 * It only ever READS snapshots handed to it; nothing here can influence the simulation. Sampling is incremental and
 * time-budgeted (`ForecastSampler.pump`) so the app can spread it over frames while the sim clock is frozen.
 */

/** Ticks between forecast samples (0.1 s; an echo moves at most 240 units = 0.24 tile per sample). */
export const FORECAST_STEP = 6;
/** Ticks between ghost-path tick markers (1 s). */
export const GHOST_MARKER_TICKS = 60;

export interface ForecastActor {
  id: string;
  echoIndex: number;
  /** Nested-loop copy depth (absent for plain echoes). */
  recursion?: number;
  x: number;
  y: number;
  z: number;
  finished: boolean;
}

export interface ForecastSample {
  tick: number;
  actors: ForecastActor[];
  /** Height (units) of each walk-on trigger at this tick (lifts move). */
  triggerY: Record<string, number>;
}

export interface WalkOnTrigger {
  id: string;
  kind: 'pressurePlate' | 'elevator';
  col: number;
  row: number;
}

export interface GhostPoint {
  tick: number;
  x: number;
  y: number;
  z: number;
}

export interface GhostPath {
  actorId: string;
  echoIndex: number;
  recursion?: number;
  /** Positions in units (sim space), ascending tick, consecutive duplicates removed. */
  points: GhostPoint[];
  /** One marker per GHOST_MARKER_TICKS after the base tick; `seconds` = whole seconds after the base. */
  markers: (GhostPoint & { seconds: number })[];
}

export interface WalkOn {
  entityId: string;
  entityKind: WalkOnTrigger['kind'];
  actorId: string;
  echoIndex: number;
  /** First sampled tick the echo's centre is on the trigger (or the base tick if it already was). */
  enterTick: number;
  /** First sampled tick it is off again, or null if it stays until the end of the forecast. */
  leaveTick: number | null;
}

/** Objects an echo triggers simply by standing on them (no E press): pressure plates and 'ride' lifts. */
export function walkOnTriggers(level: LevelDefinition): WalkOnTrigger[] {
  const out: WalkOnTrigger[] = [];
  for (const e of level.entities) {
    if (e.kind === 'pressurePlate') out.push({ id: e.id, kind: 'pressurePlate', col: e.col, row: e.row });
    else if (e.kind === 'elevator' && (e.config as { mode?: string }).mode === 'ride') out.push({ id: e.id, kind: 'elevator', col: e.col, row: e.row });
  }
  return out;
}

/** Compact sample of one snapshot: echo actors only (the player is idle in a forecast). */
export function sampleOf(view: SimView, triggers: readonly WalkOnTrigger[]): ForecastSample {
  const actors: ForecastActor[] = [];
  for (const a of view.actors) {
    if (a.kind !== 'echo') continue;
    const fa: ForecastActor = { id: a.id, echoIndex: a.echoIndex, x: a.x, y: a.y, z: a.z, finished: a.finished };
    if (a.recursion !== undefined) fa.recursion = a.recursion;
    actors.push(fa);
  }
  const triggerY: Record<string, number> = {};
  for (const t of triggers) {
    const e = view.entities[t.id];
    if (e) triggerY[t.id] = e.y;
  }
  return { tick: view.tick, actors, triggerY };
}

/** True when no echo will move again: every echo has finished replaying (finished echoes idle in place). */
export function allSettled(s: ForecastSample): boolean {
  return s.actors.every((a) => a.finished);
}

/**
 * Incremental, time-budgeted forecast of the current pass from `baseTick` to the loop end (or until every echo has
 * finished). Call `pump` each frame; `samples` grows monotonically and is always a valid prefix.
 */
export class ForecastSampler {
  readonly samples: ForecastSample[] = [];
  private next: number;
  done = false;

  constructor(
    readonly key: string,
    readonly baseTick: number,
    readonly endTick: number,
    private readonly triggers: readonly WalkOnTrigger[],
    readonly step = FORECAST_STEP,
  ) {
    this.next = baseTick;
  }

  /** Last tick covered by the samples (base tick - 1 if empty). */
  get coveredTick(): number {
    return this.samples.length ? (this.samples[this.samples.length - 1] as ForecastSample).tick : this.baseTick - 1;
  }

  /**
   * Samples snapshots until `budgetMs` (measured with `now`) is spent or the forecast is complete. At least one
   * sample is taken per call so progress is guaranteed. Returns true when new samples were added.
   */
  pump(getSnapshotAt: (tick: number) => SimView, budgetMs: number, now: () => number): boolean {
    if (this.done) return false;
    const t0 = now();
    let added = false;
    do {
      const t = Math.min(this.next, this.endTick);
      const s = sampleOf(getSnapshotAt(t), this.triggers);
      this.samples.push(s);
      added = true;
      // A snapshot clamps at the loop end / stops when the pass ends (complete, time up): nothing further to see.
      if (t >= this.endTick || s.tick < t || allSettled(s)) {
        this.done = true;
        break;
      }
      this.next = t + this.step;
    } while (now() - t0 < budgetMs);
    return added;
  }
}

/**
 * Ghost paths for the temporal preview: each echo's upcoming movement from `fromTick`, as a polyline in sim units
 * plus a marker every second. Echoes that never move in the window get no path. `hidden` = actor ids (and loop
 * prefixes) hidden on the timeline.
 */
export function extractGhostPaths(samples: readonly ForecastSample[], fromTick: number, hidden: ReadonlySet<string> = new Set()): GhostPath[] {
  const byActor = new Map<string, GhostPath>();
  const order: string[] = [];
  const nextMarker = new Map<string, number>();
  for (const s of samples) {
    if (s.tick < fromTick) continue;
    for (const a of s.actors) {
      if (hidden.has(a.id) || hidden.has(a.id.replace(/\.\d+$/, ''))) continue;
      let p = byActor.get(a.id);
      if (!p) {
        p = { actorId: a.id, echoIndex: a.echoIndex, points: [], markers: [] };
        if (a.recursion !== undefined) p.recursion = a.recursion;
        byActor.set(a.id, p);
        order.push(a.id);
      }
      const last = p.points[p.points.length - 1];
      if (!last || last.x !== a.x || last.y !== a.y || last.z !== a.z) p.points.push({ tick: s.tick, x: a.x, y: a.y, z: a.z });
      const rel = s.tick - fromTick;
      const due = nextMarker.get(a.id) ?? GHOST_MARKER_TICKS;
      if (rel >= due) {
        const seconds = Math.floor(rel / GHOST_MARKER_TICKS);
        p.markers.push({ tick: s.tick, x: a.x, y: a.y, z: a.z, seconds });
        nextMarker.set(a.id, (seconds + 1) * GHOST_MARKER_TICKS);
      }
    }
  }
  const out: GhostPath[] = [];
  for (const id of order) {
    const p = byActor.get(id) as GhostPath;
    if (p.points.length < 2) continue; // stands still for the whole window
    // markers only where the echo is still travelling (drop those after its last movement)
    const lastMove = (p.points[p.points.length - 1] as GhostPoint).tick;
    p.markers = p.markers.filter((m) => m.tick <= lastMove);
    out.push(p);
  }
  return out;
}

/** Same occupancy rule as the plate behaviour: actor centre in the trigger's cell, feet within the step tolerance. */
function isOn(a: ForecastActor, t: WalkOnTrigger, triggerY: number | undefined): boolean {
  if (fdiv(a.x, UNITS_PER_TILE) !== t.col || fdiv(a.z, UNITS_PER_TILE) !== t.row) return false;
  if (triggerY === undefined) return true;
  const d = a.y - triggerY;
  return d <= PHYS.STEP_TOLERANCE && d >= -PHYS.STEP_TOLERANCE;
}

/**
 * Walk-on plan: for every (trigger, echo) pair, each interval during which the echo stands on the trigger,
 * in ascending enter tick. Derived purely from forecast samples.
 */
export function scheduleWalkOns(samples: readonly ForecastSample[], triggers: readonly WalkOnTrigger[]): WalkOn[] {
  const out: WalkOn[] = [];
  const open = new Map<string, WalkOn>();
  for (const s of samples) {
    const seen = new Set<string>();
    for (const t of triggers) {
      for (const a of s.actors) {
        if (!isOn(a, t, s.triggerY[t.id])) continue;
        const key = `${t.id}|${a.id}`;
        seen.add(key);
        if (!open.has(key)) {
          const w: WalkOn = { entityId: t.id, entityKind: t.kind, actorId: a.id, echoIndex: a.echoIndex, enterTick: s.tick, leaveTick: null };
          open.set(key, w);
          out.push(w);
        }
      }
    }
    for (const [key, w] of open) {
      if (seen.has(key)) continue;
      w.leaveTick = s.tick;
      open.delete(key);
    }
  }
  out.sort((a, b) => a.enterTick - b.enterTick || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : a.echoIndex - b.echoIndex));
  return out;
}

/**
 * Largest distance (units, Chebyshev) between a live echo and where the forecast placed it at the sample nearest
 * `view.tick`. The app re-forecasts when this grows (the player bumped the world off the predicted course).
 * Returns 0 when the forecast does not cover the tick.
 */
export function forecastDeviation(samples: readonly ForecastSample[], view: SimView): number {
  if (!samples.length) return 0;
  const first = samples[0] as ForecastSample;
  const last = samples[samples.length - 1] as ForecastSample;
  if (view.tick < first.tick || view.tick > last.tick + FORECAST_STEP) return 0;
  // binary search for the last sample <= tick
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((samples[mid] as ForecastSample).tick <= view.tick) lo = mid;
    else hi = mid - 1;
  }
  const s = samples[lo] as ForecastSample;
  const slack = (view.tick - s.tick) * PHYS.ACTOR_SPEED;
  let worst = 0;
  for (const a of view.actors) {
    if (a.kind !== 'echo') continue;
    const f = s.actors.find((x) => x.id === a.id);
    if (!f) {
      worst = Math.max(worst, UNITS_PER_TILE * 10);
      continue;
    }
    const d = Math.max(Math.abs(f.x - a.x), Math.abs(f.z - a.z), Math.abs(f.y - a.y)) - slack;
    worst = Math.max(worst, d);
  }
  return Math.max(0, worst);
}
