# Progress: Audio / VFX Designer (Agent 7)

I own `src/engine/audio/**`. I did not edit any shared or contract files, `package.json`, or other teams' directories, and I added no dependencies.
The full sound design is in `docs/game-design/audio.md`.

## Completed
- **`createAudioSystem(opts)`** returns `{ unlock, handleEvents(events, state), setMusicState, setVolumes, setPaused, playUi, update, stats, recentCues, dispose }`.
  - Every sound is synthesized procedurally with the Web Audio API. There are no sample files.
  - The system only reads `SimEvent` and `SimView`; nothing feeds back into the simulation.
  - Variation comes from a cosmetic seeded RNG that lives only in the audio module.
  - Before `unlock()` the system is inert. This respects the browser autoplay policy, and events received before unlock are not queued, so nothing bursts out when audio starts.
- **Temporal identity**:
  - Rewind: a reverse-swept granular whoosh (26 grains), a tape-stop pitch dive, a reverse swell, backwards clock ticks, a sub landing, and a "tape" low-pass sweep on the music.
  - Echo creation: a shimmering chord bloom, transposed for each echo index.
  - Record start and end: gold fifths with a tape engage/disengage.
  - Divergence: a detuned, bit-crushed glitch stutter.
  - Also: echo finished, loop deleted, chamber restart, arrival, echo limit, time up.
  - A commit batch plays as one staggered gesture: record end → rewind → bloom → record chime.
- **Mechanical sounds**: one recipe for every component event (plates, doors with servo and pneumatic stages, switches with urgent ticks, cells, sockets, elevators, platforms, lasers, receivers, gates, portal), plus crate and cell pickup/drop, use clicks, and a failed-interaction buzz.
  - Footsteps vary on every step. Echo footsteps are softer, low-passed and have a shimmer tail. Elevators and platforms add a metal-grate ring.
  - Sounds are panned by x relative to the player and attenuated with distance.
- **Continuous machinery loops** for laser, elevator, platform, plate, socket, portal and gate. They are reconciled against state every frame, so a rewind or scrub cannot leave one stuck. Only the 8 nearest play, a 0.2 s release grace stops flapping, and loops duck while paused.
- **Ambience**: a deep D1/A1 drone with breathing brown-noise rumble, drifting air, distant machinery clanks and ratchets (mostly reverb), a far piston with exhaust, and a quiet tick/tock clock.
- **Generative music** with six layers (pad, bells, bass, pulse, arp, choir) and four states: menu, explore, solving, complete (plus silent).
  - States crossfade over about 2.5 s, and harmony changes on chord boundaries.
  - The arp gets denser as echoes are added.
  - With `autoMusic` on, the state follows `levelLoaded`, `echoSpawned`, `loopDeleted`, `levelComplete` and `chamberRestart`. `complete` and `menu` are sticky.
- **Mix**:
  - Per-category buses feed sfx; music has its own bus.
  - The master chain is a glue compressor, then a limiter (−4 dB, 20:1), then a tanh soft clip.
  - Reverb is a convolver with a procedurally generated 3.4 s hall impulse response.
  - Volumes use a perceptual x² curve, are clamped and smoothed, and master is capped at 0.9 for headroom.
- **Voice limiting**:
  - Rules, in order: dedupe by key within 45 ms → burst limit (footsteps: 3 voices starting within ±50 ms) → per-category polyphony → global cap of 64.
  - Priorities are temporal/UI > player > world > echo. Voices are stolen oldest and lowest-priority first, with a 30 ms fade-out.
  - The live player's footstep always gets through a crowd of echoes.

## Files (all new)
- `src/engine/audio/index.ts`: barrel.
- `src/engine/audio/types.ts`: public types (`AudioSystem`, `MusicState`, `UiSoundKind`, `Cue`, `AudioStats`, `AudioSystemOptions`).
- `src/engine/audio/AudioSystem.ts`: `createAudioSystem` (lifecycle, cue playback, scheduler, auto music, pause and tape sweeps).
- `src/engine/audio/mapping.ts`: the pure event → cue mapper (spatialisation, sequencing, priorities).
- `src/engine/audio/sfx.ts`: the synthesis recipes, 41 game sounds plus 10 UI sounds (`RECIPES`).
- `src/engine/audio/synth.ts`: noise bank (white, pink, brown), envelopes, oscillator and filter helpers, crush curve.
- `src/engine/audio/voices.ts`: `VoiceManager` (the limiter).
- `src/engine/audio/loops.ts`: `LoopBank` (state-driven machinery loops).
- `src/engine/audio/ambience.ts`: the facility soundscape.
- `src/engine/audio/music.ts`: the generative score (`LAYER_MIX`, `MUSIC_LAYERS`).
- `src/engine/audio/mixer.ts`: master chain, buses and impulse-response generator.
- `src/engine/audio/rng.ts`: the cosmetic RNG.
- `src/engine/audio/testing/mockAudioContext.ts`: a minimal Web Audio mock. It records the graph and schedule, and validates finite values, non-zero exponential ramps and start/stop order.
- `src/engine/audio/audio.test.ts`: 26 tests.
- `docs/game-design/audio.md`: the sound design document.
- I removed the empty `src/engine/audio/.gitkeep`.

## Tests run (real results)
- `npx tsc --noEmit`: clean, for the whole repo.
- `npx vitest run`: **16 files, 180/180 passed**, including my 26 audio tests. The audio tests cover:
  - event → cue mapping for every `SimEvent` type, and every cue resolving to a recipe;
  - echo versus player footsteps and pan direction;
  - commit and reset sequencing;
  - multi-tick spreading;
  - every recipe building a finite graph in which every source is stopped and tracked;
  - the structure of the rewind;
  - burst, category, priority, steal, fade and dedupe limiting;
  - unlock and autoplay behaviour;
  - the master chain topology;
  - volume curve and clamping;
  - the lookahead scheduler;
  - music crossfade targets and automatic phases;
  - loop start, grace release and nearest-8 culling;
  - UI cues and dispose;
  - an **end-to-end playthrough** of the test chamber's verified solution with the real `TemporalGame`.
- Extra check in Chromium 1194, using scratch scripts that are not committed:
  - **Offline render**: I rendered every recipe and every music state offline through the full mixer. There were no NaN samples and no clipping (maximum peak 0.87, from `restart`). Music measured −25 to −31 dBFS RMS and ambience −30.6 dBFS RMS. I rebalanced quiet cues (UI, ticks, echo finished) and an ambience that was too loud based on these measurements.
  - **Real-time pass**: I ran a real-time `AudioContext` over all three campaign solutions. There were no page errors, all three levels completed, and music ended in `complete`. The L01 pass at real-time pace dropped 0 voices with at most 9 sounding at once. Drops only happen when the run is deliberately fast-forwarded at 15× speed.

## Integration notes for the Director (app wiring; I did not touch `src/app`)
```ts
import { createAudioSystem } from '../engine/audio';
const audio = createAudioSystem({ volumes: { master: s.masterVolume / 100, music: s.musicVolume / 100, sfx: s.sfxVolume / 100 } });
addEventListener('pointerdown', () => void audio.unlock(), { once: true });
addEventListener('keydown', () => void audio.unlock(), { once: true });
// in frame(): drain ONCE and fan out to UI + audio
const events = game.drainEvents(); ui.onEvents(events); audio.handleEvents(events, game.getState());
// UI: onUISound: (cue) => audio.playUi(cue); settings change → audio.setVolumes(...)
// pause → audio.setPaused(true/false); menus → audio.setMusicState('menu'); level start → (auto) explore
// dispose → audio.dispose()
```
- `drainEvents()` empties the queue, so the app has to drain once per frame and pass the same array to every consumer: UI, audio and VFX.
- Call `handleEvents` every frame, even when there are no events (`[]`), because the machinery loops are reconciled from state.
- Settings volumes are 0..100. `setVolumes` expects 0..1.

## Outstanding issues
- The VFX half of the role (particles, shader effects) belongs to the Graphics team's `src/graphics/effects`, which is not my directory. Audio-reactive hooks are available if they want them: `recentCues()`, and `stats().musicState`.
- The audio system is not yet wired into `src/app/bootstrap.ts`, which the Director owns. See the snippet above.
- Door travel time uses the default 18 ticks (0.3 s) because `DoorConfig.openTicks` is not in the state. Doors with custom timing still sound correct, but the end-stop thunk may land slightly early or late.
- Spatialisation uses the player as the listener. If the camera is in puzzle overview mode, an option to pan relative to the camera centre would be more accurate (`listenerOf` is the single place to change).

## Dependencies
- Contracts (read-only): `SimEvent`, `SimView`, `cellOf`, `UNITS_PER_TILE`.
- My tests use `TemporalGame`, `createDefaultRegistry`, `TEST_LEVELS` and `compileSolution`. Non-test audio code imports only `src/engine/contracts`.

## Next tasks
1. Wire into the app once the Director is ready, and add a Playwright assertion that `unlock()` runs without page errors.
2. Add an `audio-preview.html` audition page (a button per recipe, plus music-state switches) if the Director approves a root entry.
3. Optional per-level ambience flavours (for example a reactor hum for L10 "The Core") through an optional `LevelDefinition.audio` hint. That would be an additive contract change, so it needs sign-off first.
4. Add a nested-loop (L08) variant of the bloom and rewind once that mechanic exists.
