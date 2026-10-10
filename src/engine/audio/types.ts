import type { SimEvent, SimView } from '../contracts';

/**
 * Public types of the procedural audio system (Agent 7 — Audio / VFX).
 *
 * The audio system is a pure CONSUMER: it reads SimEvents and the read-only SimView, and never writes to the
 * simulation. Every sound is synthesized at runtime with the Web Audio API (no sample files). Randomness is a
 * cosmetic seeded RNG local to this module.
 */

export type MusicState = 'menu' | 'explore' | 'solving' | 'complete' | 'silent';

/** UI cue kinds. Superset of `UICallbacks.onUISound` cues ('hover' | 'confirm' | 'back' | 'toggle' | 'error'). */
export type UiSoundKind =
  | 'hover'
  | 'click'
  | 'confirm'
  | 'back'
  | 'toggle'
  | 'error'
  | 'open'
  | 'close'
  | 'slider'
  | 'scrub';

/** Linear 0..1 volumes (Settings stores 0..100: divide by 100). Values are clamped. */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
}

/** Sound categories used for bus routing and voice limiting. */
export type VoiceCategory = 'footstep' | 'mechanical' | 'temporal' | 'ui' | 'stinger' | 'ambient' | 'music';

/** A resolved cue: what the mapper decided to play for one event. Exposed for tests / debugging. */
export interface Cue {
  /** Recipe name (see sfx.ts `RECIPES`). */
  sound: string;
  category: VoiceCategory;
  /** Stereo pan −1..1 (0 = centre). */
  pan: number;
  /** Linear gain multiplier (distance attenuation, echo softening, ...). */
  gain: number;
  /** Delay in seconds relative to "now" (used to sequence rewind → bloom → record chime). */
  delay: number;
  /** Optional per-recipe parameter bag (all numbers; e.g. echo index, foot, remaining seconds). */
  params: Record<string, number>;
  /** Dedupe key: two cues with the same key inside the dedupe window collapse into one. */
  key?: string;
  /** Source actor kind for footsteps / interactions (echo sounds are softer). */
  actor?: 'player' | 'echo';
}

export interface AudioStats {
  /** Voices currently sounding (one-shots; continuous loops counted separately). */
  activeVoices: number;
  activeByCategory: Record<VoiceCategory, number>;
  /** Continuous machinery loops currently running (laser hum, elevator motor, ...). */
  activeLoops: number;
  /** Total cues played / dropped by the voice limiter or dedupe since creation. */
  played: number;
  dropped: number;
  musicState: MusicState;
  unlocked: boolean;
}

export interface AudioSystem {
  /** Create/resume the AudioContext. Call from the first user gesture (click/keydown). Idempotent. */
  unlock(): Promise<void>;
  /** Feed the events drained this frame plus the current read-only state. Safe to call before unlock (no-op). */
  handleEvents(events: readonly SimEvent[], state: SimView): void;
  /** Smoothly crossfade the generative music to a new state. */
  setMusicState(state: MusicState): void;
  /** Partial update of bus volumes (0..1 linear, perceptually curved internally). */
  setVolumes(v: Partial<AudioVolumes>): void;
  /** Game paused: machinery loops duck, music is filtered. */
  setPaused(paused: boolean): void;
  playUi(kind: UiSoundKind): void;
  /** Manual scheduler pump (music/ambience lookahead). Called internally by an interval; tests call it. */
  update(): void;
  stats(): AudioStats;
  /** Most recent resolved cues (ring buffer, newest last) — debug / tests. */
  recentCues(): readonly Cue[];
  dispose(): void;
}

export interface AudioSystemOptions {
  /** Inject a context (tests) or a factory. Default: `new AudioContext()` on unlock(). */
  context?: BaseAudioContext | (() => BaseAudioContext);
  /** Cosmetic RNG seed. */
  seed?: number;
  /** 'interval' (default) pumps update() every 100 ms; 'manual' leaves it to the caller. */
  scheduler?: 'interval' | 'manual';
  volumes?: Partial<AudioVolumes>;
  /** Automatically follow chamber events (echoSpawned → solving, levelComplete → complete...). default true */
  autoMusic?: boolean;
}
