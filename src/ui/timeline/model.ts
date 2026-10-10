import type { EntityKind, InteractionKind, Timeline, TimelineMarker } from '../../engine/contracts';
import type { EchoPaletteId } from '../../persistence/settings';
import { echoStyle, playerStyle, type TrackStyle } from '../palette';

/**
 * TEMPORAL TIMELINE — pure view-model math (no DOM). Tested in timeline.test.ts.
 *
 * Coordinates: the full timeline spans [0, maxTicks]. Content is laid out in fractions of maxTicks; zoom shows a
 * window of `span = maxTicks / zoom` ticks starting at `start`. When zoomed, the window follows a focus tick
 * (the playhead, or the scrub position) and is clamped to the content.
 */

export const SIM_HZ_UI = 60;
export const ZOOM_LEVELS = [1, 2, 4, 8] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export interface Viewport {
  /** First visible tick. */
  start: number;
  /** Visible ticks. */
  span: number;
  maxTicks: number;
  zoom: number;
}

export function nextZoom(z: number): ZoomLevel {
  const i = ZOOM_LEVELS.indexOf(z as ZoomLevel);
  return ZOOM_LEVELS[(i + 1) % ZOOM_LEVELS.length] as ZoomLevel;
}

/**
 * Window for a zoom level. The focus tick is kept at ~35% from the left edge (looking ahead is more useful than
 * looking back) and the window is clamped to [0, maxTicks].
 */
export function computeViewport(maxTicks: number, zoom: number, focusTick: number): Viewport {
  const max = Math.max(1, maxTicks);
  const z = Math.max(1, zoom);
  const span = max / z;
  if (z === 1) return { start: 0, span: max, maxTicks: max, zoom: 1 };
  const start = Math.min(max - span, Math.max(0, focusTick - span * 0.35));
  return { start, span, maxTicks: max, zoom: z };
}

/** Position of a tick inside the whole content, 0..1. */
export function contentFrac(tick: number, maxTicks: number): number {
  return Math.min(1, Math.max(0, tick / Math.max(1, maxTicks)));
}

/** Position of a tick inside the visible window, 0..1 (may be <0 or >1 when off-screen). */
export function viewFrac(tick: number, vp: Viewport): number {
  return (tick - vp.start) / vp.span;
}

/** Tick under a pointer at window fraction `frac` (0 = left edge of lanes), clamped and rounded. */
export function tickAtViewFrac(frac: number, vp: Viewport, limit = vp.maxTicks): number {
  const t = Math.round(vp.start + Math.min(1, Math.max(0, frac)) * vp.span);
  return Math.min(Math.max(0, limit), Math.max(0, t));
}

/**
 * CSS for the zoomed content: width as a multiple of the window and translation so `start` is at the left edge.
 * Returned as numbers (percent of the WINDOW width / of the CONTENT width).
 */
export function contentTransform(vp: Viewport): { widthPct: number; translatePct: number } {
  return { widthPct: vp.zoom * 100, translatePct: -(vp.start / vp.maxTicks) * 100 };
}

/** "0:07.5" style time label from ticks (60 Hz). `precise` adds hundredths. */
export function formatTicks(ticks: number, precise = false): string {
  const t = Math.max(0, ticks);
  const totalSec = t / SIM_HZ_UI;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  const sec = precise ? s.toFixed(2) : s.toFixed(1);
  const pad = s < 10 ? '0' : '';
  return `${m}:${pad}${sec}`;
}

/** Whole-second clock "00:12" (for the ruler). */
export function formatClock(ticks: number): string {
  const sec = Math.round(ticks / SIM_HZ_UI);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export interface RulerTick {
  tick: number;
  major: boolean;
  label: string | null;
}

/** Candidate ruler steps in seconds. */
const STEPS_SEC = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];

/**
 * Picks the smallest step (seconds) whose MINOR spacing is at least `minPx` on screen and returns ruler ticks over
 * the whole content. Every `majorEvery`-th tick is major and labelled.
 */
export function rulerStep(vp: Viewport, windowPx: number, minPx = 14): number {
  const pxPerTick = windowPx / vp.span;
  for (const s of STEPS_SEC) if (s * SIM_HZ_UI * pxPerTick >= minPx) return s;
  return STEPS_SEC[STEPS_SEC.length - 1] as number;
}

export function rulerTicks(vp: Viewport, windowPx: number, minPx = 14, majorEvery = 5): RulerTick[] {
  const stepSec = rulerStep(vp, windowPx, minPx);
  const stepTicks = stepSec * SIM_HZ_UI;
  const out: RulerTick[] = [];
  const n = Math.floor(vp.maxTicks / stepTicks + 1e-9);
  for (let i = 0; i <= n; i++) {
    const tick = Math.round(i * stepTicks);
    const major = i % majorEvery === 0;
    out.push({ tick, major, label: major ? (stepSec < 1 ? formatTicks(tick) : formatClock(tick)) : null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Tracks

export type MarkerState = 'done' | 'pending' | 'failed' | 'diverged';

export interface MarkerModel {
  tick: number;
  kind: InteractionKind;
  verb: 'interact' | 'action';
  entityKind: EntityKind | null;
  entityId: string | null;
  state: MarkerState;
  /** Accessible description ("Echo 1 picks up crate at 0:04.2"). */
  title: string;
}

export interface DivergenceModel {
  tick: number;
  title: string;
}

export interface TrackModel {
  /** Stable key: "player" or "echo:<loopId>". */
  key: string;
  kind: 'player' | 'echo';
  echoIndex: number;
  loopId: number | null;
  style: TrackStyle;
  durationTicks: number;
  /** Ticks of this track already played in the current pass (player: recorded so far). */
  playedTicks: number;
  finishedAtTick: number | null;
  markers: MarkerModel[];
  divergences: DivergenceModel[];
  /** First divergence tick or null (lane is hatched coral after it). */
  divergedAt: number | null;
  visible: boolean;
  selected: boolean;
  /** Nested loops: recursive copy depth (>= 1) of loop `loopId`, or 0 for an ordinary track. */
  recursion: number;
  /** Tick this track starts replaying (copies of a nested loop start k·delay later); 0 otherwise. */
  startTick: number;
}

const VERB_TEXT: Record<InteractionKind, string> = {
  pickup: 'picks up',
  drop: 'drops',
  insert: 'inserts into',
  extract: 'extracts from',
  use: 'uses',
  action: 'activates',
  none: 'does nothing',
  fail: 'fails at',
};

const KIND_TEXT: Partial<Record<EntityKind, string>> = {
  pressurePlate: 'plate',
  timedSwitch: 'switch',
  energyCell: 'energy cell',
  energySocket: 'socket',
  laserEmitter: 'emitter',
  laserReceiver: 'receiver',
  temporalGate: 'gate',
  movingPlatform: 'platform',
  exitPortal: 'exit',
};

export function entityKindLabel(kind: EntityKind | null): string {
  if (!kind) return 'object';
  return KIND_TEXT[kind] ?? kind;
}

export function markerTitle(who: string, m: Pick<TimelineMarker, 'kind' | 'entityKind' | 'tick' | 'reason'>): string {
  const what = m.kind === 'none' ? '' : ` ${entityKindLabel(m.entityKind)}`;
  const why = m.kind === 'fail' && m.reason ? ` (${m.reason})` : '';
  return `${who} ${VERB_TEXT[m.kind]}${what}${why} at ${formatTicks(m.tick)}`;
}

export interface BuildTracksOptions {
  palette?: EchoPaletteId;
  /** loopIds hidden by the player. */
  hidden?: ReadonlySet<number>;
  /** Selected echo index (0-based) or null. */
  selectedEcho?: number | null;
}

/**
 * Builds lane models from the engine Timeline. Order: PLAYER (current) first, then Echo 1..n (concept sheet).
 * Echo markers come from the PLANNED interactions (the recording) and are marked done / pending / diverged by
 * comparing with what actually happened this pass; the player's markers are what it actually did.
 * 'none' attempts (pressing E at nothing) are omitted.
 */
export function buildTrackModels(timeline: Timeline, opts: BuildTracksOptions = {}): TrackModel[] {
  const palette = opts.palette ?? 'default';
  const hidden = opts.hidden ?? new Set<number>();
  const now = timeline.currentTick;
  const out: TrackModel[] = [];
  let player: TrackModel | null = null;

  for (const tr of timeline.tracks) {
    const isPlayer = tr.kind === 'player';
    const style = isPlayer ? playerStyle(palette) : echoStyle(tr.echoIndex, palette);
    const who = isPlayer ? 'You' : style.label;
    const divTicks = new Set(tr.divergences.map((d) => d.tick));
    const source = isPlayer ? tr.actual : tr.planned;
    const markers: MarkerModel[] = [];
    for (const m of source) {
      if (m.kind === 'none') continue;
      // A marker at tick t has been simulated once the pass has advanced past t (state.tick = ticks simulated).
      let state: MarkerState;
      if (divTicks.has(m.tick)) state = 'diverged';
      else if (!m.success) state = 'failed';
      else state = isPlayer || m.tick < now ? 'done' : 'pending';
      markers.push({
        tick: m.tick,
        kind: m.kind,
        verb: m.verb,
        entityKind: m.entityKind,
        entityId: m.entityId,
        state,
        title: markerTitle(who, m),
      });
    }
    markers.sort((a, b) => a.tick - b.tick);
    const divergences = tr.divergences.map((d) => ({
      tick: d.tick,
      title: `Paradox: ${style.label} expected to ${VERB_TEXT[d.expected.kind]} ${d.expected.entityId ?? 'nothing'} but ${VERB_TEXT[d.actual.kind]} ${d.actual.entityId ?? 'nothing'} at ${formatTicks(d.tick)}`,
    }));
    const model: TrackModel = {
      key: tr.actorId,
      kind: tr.kind,
      echoIndex: tr.echoIndex,
      loopId: tr.loopId,
      style,
      durationTicks: tr.durationTicks,
      playedTicks: isPlayer ? tr.durationTicks : Math.max(0, Math.min(now - (tr.startTick ?? 0), tr.durationTicks)),
      finishedAtTick: tr.finishedAtTick,
      markers,
      divergences,
      divergedAt: divergences.length ? Math.min(...divergences.map((d) => d.tick)) : null,
      visible: isPlayer || tr.loopId === null || !hidden.has(tr.loopId),
      selected: !isPlayer && opts.selectedEcho === tr.echoIndex && tr.recursion === undefined,
      recursion: tr.recursion ?? 0,
      startTick: tr.startTick ?? 0,
    };
    if (isPlayer) player = model;
    else out.push(model);
  }
  out.sort((a, b) => a.echoIndex - b.echoIndex || a.recursion - b.recursion);
  return player ? [player, ...out] : out;
}

/**
 * Structural signature of the lane DOM: changes only when lanes must be rebuilt (not on every playhead move).
 * Marker done/pending state is included because it changes discretely as the playhead passes markers.
 */
export function tracksSignature(tracks: readonly TrackModel[], zoom: number, palette: string): string {
  return (
    `${zoom}|${palette}|` +
    tracks
      .map(
        (t) =>
          // The live player's duration grows every tick; its span is updated in place, not rebuilt.
          `${t.key}:${t.kind === 'player' ? 'live' : t.durationTicks}:${t.visible ? 1 : 0}${t.selected ? 's' : ''}:${t.finishedAtTick ?? '-'}:` +
          t.markers.map((m) => `${m.tick}${m.state[0]}`).join(',') +
          `:${t.divergences.length}`,
      )
      .join(';')
  );
}

/** Cycles echo selection: null → 0 → 1 → … → n-1 → null. */
export function cycleEchoSelection(current: number | null, echoCount: number): number | null {
  if (echoCount <= 0) return null;
  if (current === null) return 0;
  return current + 1 >= echoCount ? null : current + 1;
}

/** Keyboard scrubbing step (ticks): 1 s, or 0.1 s (6 ticks) with Shift. */
export function scrubStep(fine: boolean): number {
  return fine ? 6 : SIM_HZ_UI;
}
