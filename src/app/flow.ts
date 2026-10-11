import type { SimView } from '../engine/contracts';
import { deviceProfile, resolveQuality, type QualityLevel } from '../engine/rendering';
import type { ComfortSettings } from '../engine/rendering/comfort';
import { QUALITY_PRESETS, type QualityPreset, type Settings } from '../persistence/settings';

/**
 * App-level helpers (director-owned). Nothing here touches the simulation rules: these only decide which state
 * is SHOWN (live, scrubbed snapshot, rewind playback) and which inputs are FED to the TemporalGame.
 */

/** Top-level app flow. `playing` covers the paused / timeline-inspect / temporal-preview sub-states. */
export type AppMode = 'boot' | 'menu' | 'intro' | 'playing' | 'complete';

/**
 * Renderer preset for a Settings / URL value: 'auto' picks by device ('mobile' on phones/tablets, 'high' on
 * desktop; see engine/rendering/device.ts); 'ultra' tops out at 'high'; explicit presets are respected.
 */
export function rendererQuality(q: QualityPreset | string | null | undefined): QualityLevel {
  return resolveQuality(q, deviceProfile());
}

/**
 * `?quality=` URL override, validated against the Settings presets (null when absent or unknown). While set it wins
 * over the saved preset, and the Settings screen shows it (see createUI `qualityOverride`).
 */
export function qualityOverrideOf(param: string | null | undefined): QualityPreset | null {
  return param && (QUALITY_PRESETS as readonly string[]).includes(param) ? (param as QualityPreset) : null;
}

/** Renderer comfort settings (camera sensitivity, reduced motion) from the player's Settings. */
export function comfortOf(s: Pick<Settings, 'cameraSensitivity' | 'reducedMotion'>): ComfortSettings {
  return { cameraSensitivity: s.cameraSensitivity, reducedMotion: s.reducedMotion };
}

/**
 * The main-menu attract replay is suspended (sim paused, backdrop redrawn rarely) while a sub-screen (settings,
 * level select, credits) covers the menu.
 */
export function attractSuspended(mode: AppMode, screen: string | null): boolean {
  return mode === 'menu' && screen !== null && screen !== 'menu';
}

// solutionFor (attract replay / debug solve) lives in ./solutions and is loaded lazily via ./lazySolutions, so the
// headless test harness stays out of the boot bundle.

/**
 * Presentation filter for the timeline's per-echo visibility toggles: returns a view without the hidden echoes.
 * Only the copy handed to the renderer changes; the simulation still contains (and is affected by) every echo.
 */
export function withoutHiddenEchoes(view: SimView, hidden: ReadonlySet<string>): SimView {
  if (hidden.size === 0) return view;
  // nested-loop copies (`echo:<loop>.<k>`) hide with the echo they replay
  return { ...view, actors: view.actors.filter((a) => !hidden.has(a.id) && !hidden.has(a.id.replace(/\.\d+$/, ''))) } as SimView;
}

/**
 * REWIND PLAYBACK: before a loop is committed, sample exact snapshots of the current pass from the present back
 * to tick 0. The app plays them (sim frozen) for a fraction of a second so the rewind reads as time running
 * backwards, then resumes the new loop. Purely visual: the snapshots come from TemporalGame.getSnapshotAt.
 */
export function sampleRewind(getSnapshotAt: (tick: number) => SimView, fromTick: number, frames: number): SimView[] {
  const out: SimView[] = [];
  if (fromTick <= 0) return out;
  const n = Math.max(2, Math.min(frames, fromTick));
  for (let i = 0; i <= n; i++) out.push(getSnapshotAt(Math.round(fromTick * (1 - i / n))));
  return out;
}
