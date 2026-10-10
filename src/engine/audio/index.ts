/** Procedural audio (Agent 7). Consumes SimEvents + SimView read-only; never touches the simulation. */
export { createAudioSystem } from './AudioSystem';
export type { AudioStats, AudioSystem, AudioSystemOptions, AudioVolumes, Cue, MusicState, UiSoundKind, VoiceCategory } from './types';
export { mapEvents, spatial, listenerOf, priorityOf } from './mapping';
export { RECIPES } from './sfx';
export { VOICE_LIMITS, GLOBAL_VOICE_LIMIT, BURST_LIMIT } from './voices';
export { LAYER_MIX, MUSIC_LAYERS } from './music';
