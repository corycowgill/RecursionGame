/**
 * PLAYER SETTINGS — presentation-only preferences (never read by the simulation).
 * Consumers: graphics (quality), audio (volumes), camera (sensitivity), UI (scale, motion, palette).
 */

/**
 * 'auto' (the default) lets the renderer pick by device: the 'mobile' preset on phones/tablets (iPhone/iPad incl.
 * iPadOS, coarse pointer + small screen), 'high' on desktop. Any other value is an explicit choice and is respected.
 */
export const QUALITY_PRESETS = ['auto', 'low', 'mobile', 'medium', 'high', 'ultra'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export const ECHO_PALETTES = ['default', 'highContrast'] as const;
/** 'default' = cyan/blue/violet per the art direction; 'highContrast' = Okabe-Ito colour-blind-safe set. */
export type EchoPaletteId = (typeof ECHO_PALETTES)[number];

export interface Settings {
  quality: QualityPreset;
  /** 0..100 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Camera orbit/zoom multiplier, 0.25..2. */
  cameraSensitivity: number;
  reducedMotion: boolean;
  echoPalette: EchoPaletteId;
  /** UI scale multiplier, 0.8..1.4. */
  uiScale: number;
  /** Show onboarding prompts in the first chambers. */
  tutorials: boolean;
  /** Progressive hints appear automatically after time/attempts. */
  hints: boolean;
}

export const SETTINGS_LIMITS = {
  volume: { min: 0, max: 100, step: 5 },
  cameraSensitivity: { min: 0.25, max: 2, step: 0.05 },
  uiScale: { min: 0.8, max: 1.4, step: 0.05 },
} as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  quality: 'auto',
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 80,
  cameraSensitivity: 1,
  reducedMotion: false,
  echoPalette: 'default',
  uiScale: 1,
  tutorials: true,
  hints: true,
});

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

function num(v: unknown, min: number, max: number, fallback: number, step?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  let n = Math.min(max, Math.max(min, v));
  if (step) n = Math.round(n / step) * step;
  return Math.round(n * 1000) / 1000;
}

function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Coerces unknown data into valid Settings (clamped, defaults for anything missing or malformed). */
export function sanitizeSettings(raw: unknown): Settings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const vol = SETTINGS_LIMITS.volume;
  return {
    quality: pick(s['quality'], QUALITY_PRESETS, d.quality),
    masterVolume: num(s['masterVolume'], vol.min, vol.max, d.masterVolume),
    musicVolume: num(s['musicVolume'], vol.min, vol.max, d.musicVolume),
    sfxVolume: num(s['sfxVolume'], vol.min, vol.max, d.sfxVolume),
    cameraSensitivity: num(s['cameraSensitivity'], 0.25, 2, d.cameraSensitivity),
    reducedMotion: typeof s['reducedMotion'] === 'boolean' ? s['reducedMotion'] : d.reducedMotion,
    echoPalette: pick(s['echoPalette'], ECHO_PALETTES, d.echoPalette),
    uiScale: num(s['uiScale'], 0.8, 1.4, d.uiScale),
    tutorials: typeof s['tutorials'] === 'boolean' ? s['tutorials'] : d.tutorials,
    hints: typeof s['hints'] === 'boolean' ? s['hints'] : d.hints,
  };
}

/** Effective volume 0..1 for a channel (master × channel), for the audio engine. */
export function effectiveVolume(settings: Settings, channel: 'music' | 'sfx'): number {
  const ch = channel === 'music' ? settings.musicVolume : settings.sfxVolume;
  return (settings.masterVolume / 100) * (ch / 100);
}
