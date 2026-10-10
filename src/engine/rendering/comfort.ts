/**
 * COMFORT SETTINGS → renderer parameters (pure). The player's `cameraSensitivity` (0.25..2) and `reducedMotion`
 * preferences (src/persistence/settings.ts) are mapped here to every motion-related knob the renderer has, so the
 * mapping is testable without WebGL.
 */

export interface ComfortSettings {
  /** 0.25..2, 1 = default. */
  cameraSensitivity: number;
  reducedMotion: boolean;
}

export interface ComfortParams {
  /** Mouse influence on the camera: wheel-zoom rate multiplier (the camera has no free mouse orbit). */
  zoomRate: number;
  /** Follow-camera smoothing time multiplier, 1/√sensitivity (smaller = snappier pan). */
  followSmoothing: number;
  /** Movement look-ahead multiplier for the follow camera. */
  lead: number;
  /** Camera-shake amplitude multiplier (0 = no shake). */
  shake: number;
  /** Level-intro fly-in duration (s) and how much of the orbit/height swing it plays (0..1). */
  introDuration: number;
  introSwing: number;
  /** Screen-space distortion multiplier: rewind warp, divergence glitch. */
  distortion: number;
  /** Full-screen flash multiplier (completion / rewind flashes). */
  flash: number;
  /** VFX particle burst multiplier (on top of the quality preset). */
  particles: number;
  /** Ambient motion (badge bob, dash flow, mote drift) on/off. */
  ambientMotion: boolean;
}

export const DEFAULT_COMFORT: Readonly<ComfortSettings> = Object.freeze({ cameraSensitivity: 1, reducedMotion: false });

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function comfortParams(s: Partial<ComfortSettings> = {}): ComfortParams {
  const raw = s.cameraSensitivity;
  const sens = clamp(typeof raw === 'number' && Number.isFinite(raw) ? raw : 1, 0.25, 2);
  const reduced = s.reducedMotion === true;
  return {
    zoomRate: sens,
    followSmoothing: 1 / Math.sqrt(sens),
    lead: reduced ? 0.35 : 1,
    shake: reduced ? 0 : 1,
    introDuration: reduced ? 1.1 : 3.4,
    introSwing: reduced ? 0 : 1,
    distortion: reduced ? 0.2 : 1,
    flash: reduced ? 0.45 : 1,
    particles: reduced ? 0.5 : 1,
    ambientMotion: !reduced,
  };
}
