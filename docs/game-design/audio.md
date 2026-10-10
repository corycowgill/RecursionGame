# RECURSION — Sound Design

Every sound in the game is synthesized at runtime with the Web Audio API. There are no sample files, so all audio is original and the module adds nothing to the download. The code lives in `src/engine/audio/` and is owned by Agent 7 (Audio / VFX).

Audio is a **read-only consumer**. It receives `SimEvent`s and the `SimView`, and it never writes to the simulation. Variation comes from a cosmetic seeded RNG (`AudioRng`, mulberry32) that is separate from the simulation RNG.

## Sonic identity

| Colour (art direction) | Sound language |
|---|---|
| **Gold**: player and primary interaction | Warm sine and triangle bodies, brass-like filtered saws, grounded thumps. A rising perfect fifth (A4 → E5) marks "recording". |
| **Cyan**: echoes | The same sound as the player's, but softer (footsteps at ×0.45, other SFX at ×0.75) and low-passed, with a faint high crystalline *shimmer* tail and more reverb. You can hear that a past self did it. |
| **Temporal** | Reversed envelopes, pitch dives, granular clouds, and chord blooms in D (dorian for play, lydian/major for success). |
| **Teal**: active machinery | Hums and energy sweeps on harmonics of 55 Hz (A1). |
| **Violet**: advanced temporal (gates) | FM bells with vibrato chords. |
| **Coral**: invalid / hazard | Detuned squares, bit-crush and stutter. |

### Signature temporal sounds
- **Rewind** (`rewind`, about 1.15 s):
  - a tape-stop pitch dive (detuned saws, 880 → 48 Hz, through a closing low-pass);
  - a **reverse-swept granular whoosh**: 26 noise grains, each with a reversed (swell) envelope. The grains accelerate, their band-pass sweeps from 7.2 kHz down to 260 Hz, and they ping-pong in the stereo field;
  - a reverse-cymbal "inhale";
  - seven clock ticks running backwards and accelerating;
  - a sub drop and metallic ring as the present snaps back.

  At the same moment the music bus runs a "tape" low-pass sweep (down to 380 Hz, then back). `resetLoop` (rewind without a new echo) uses `rewindShort`, a 0.7× version.
- **Echo creation** (`echoBloom`): a shimmering Dmaj9/lydian chord bloom. It uses detuned triangle pairs, 45 ms strum, 6.2 Hz tremolo, rising pentatonic sparkles and an airy swell, and sends heavily to reverb. **Each echo index transposes the bloom** (+0, +2, +5, +7, +9 semitones), so "Echo 3" literally sounds different from "Echo 1".
- **Recording start / end** (`recordStart` / `recordEnd`): a tape-engage thump, then a gold rising fifth and a high FM "ready" ping. Record end is the mirror image: a falling fifth and the tape disengaging. `timeUp` adds three descending warning beeps.
- **Divergence** (`divergence`): a detuned glitch stutter. Two clashing squares (220 / 233 Hz) plus a sub saw go through a 5-level bit-crusher and are chopped into 9 irregular slices with pitch jumps, then fall away in a detuned "error" drop. It is deliberately loud and only half-panned, because it is critical feedback.
- `echoFinished` (a soft cyan ping), `loopDeleted` (a descending digital dissolve), `restart` (a heavier rewind plus a deep boom), `arrival` (chamber boot: sub swell and distant resonance), `echoLimit` (a coral double buzz), and `fanfare` for level completion (a bell arpeggio, timpani-like hits, a brass A/D → D swell and sparkles).

### Commit sequencing
`commitLoopAndRewind()` emits `rewind`, `echoSpawned` and `recordStart` in one batch. The mapper staggers them so they read as one gesture:

`recordEnd` (0 s) → `rewind` (+0.04 s) → `echoBloom` (+0.85 s, as the echo materialises) → `recordStart` (+1.45 s).

Constants are in `SEQ` in `mapping.ts`.

## Mechanical sounds

| Event | Sound |
|---|---|
| `footstep` | Heel thump, a sole scuff that varies on every step (pitch, band, length), and a toe tap. Foot 1 is pitched slightly lower. Elevators and moving platforms add a metal-grate ring. Echo steps are softer and low-passed with a shimmer. Panned by x relative to the player. |
| `pickup` / `drop` (crate) | Magnetic clamp thunk, metal clank and a servo lift / a heavy thud, debris and two small bounces. |
| `pickup` / `drop` (energy cell) | Crystalline FM lift with a rising sweep / a glass clink. |
| `plateDown` / `plateUp` | Clunk, metal ring and a teal energize flick / a lighter clack with the hum falling. |
| `doorOpen` / `doorClose` | Unlatch, then a **servo** whine (saw plus square through a resonant band-pass glide), a **pneumatic** hiss, and an end-stop thunk / a heavy seal thud on close. `doorBlocked` is a coral two-tone warning. |
| `switchOn` / `switchTick` / `switchOff` | A toggle double-click and rising blip / tick-tock once a second that becomes urgent (higher, doubled) at 3 s or less / a falling blip and clunk. |
| `cellInserted` / `cellRemoved` | Chunk, a saw power-up sweep through an opening low-pass, then a teal confirmation chime / a power-down sweep. |
| `elevatorStart` / `elevatorArrive` | Brake release and motor spin-up / brake hiss, landing thud and an arrival ding. |
| `platformDepart` / `platformArrive` | Soft servo / soft clunk. |
| `laserOn` / `laserOff` | Charge-up zap / power-down. |
| `receiverLit` / `receiverUnlit` | Harmonic G–D–G chime / a descending pair. |
| `gateOpen` / `gateClose` | Violet FM bell, vibrato chord and a swell (reversed when closing). |
| `portalActivated` / `portalDeactivated` | Rising saw cluster into D-major-add9 with sub and air sweep / power-down. |
| `interact` (use/action), `interactFailed`, `entity` | Button click / a coral denied buzz (quieter for echoes) / a soft blip. |

### Continuous machinery loops (state-driven)
`LoopBank.sync(state)` runs every frame. It starts and stops loops from **state**, not from events, so a rewind, restart or timeline scrub can never leave a hum stuck on.

| Entity state | Loop |
|---|---|
| laser `on` | Electric beam hum |
| elevator `moving` | Motor (pitch follows direction) |
| platform travelling | Whirr |
| plate `pressed` | Teal hum |
| socket `powered` | Energy buzz |
| portal `active` | Shimmering choir |
| gate `open` | Violet field |

Only the **8 nearest** loops sound. A loop is released only after it has been unwanted for 0.2 s, which stops it flapping at moving-platform waypoints. Loops duck to 25% while paused.

## Ambient soundscape
- **Deep facility drone**: D1 sine, detuned A1 triangles and a faint D3, plus brown-noise rumble with a slowly breathing low-pass. It fades in over 4 s.
- **Air**: band-passed pink noise drifting in pitch and level.
- **Distant machinery**: inharmonic metal clanks or ratchets every 4–11 s at a random pan, almost entirely reverb. There is also a far-away piston (with exhaust hiss) every 2.4 s that skips 15% of its strokes.
- **Clock**: a very quiet tick/tock once per second. The chamber is always counting.

The ambience sits at 40% in the menu and 75% in a chamber.

## Generative music
The tempo is 84 BPM on an 8th-note grid. Notes are scheduled with a 0.6 s lookahead from `update()` (a 100 ms interval, or pumped manually). Layers that cannot be heard are not scheduled.

| Layer | Role |
|---|---|
| pad | Detuned saw pairs through a slowly opening low-pass |
| bells | Sparse FM bells on a pentatonic subset |
| bass | Sub-sine roots |
| pulse | Muted clock-like square plucks: the "machine" of solving |
| arp | Glassy arpeggio that gets denser with the echo count (`setIntensity`) |
| choir | Bright sustained shimmer for completion |

Layer mix per state (`LAYER_MIX`):

| State | pad | bells | bass | pulse | arp | choir | Harmony |
|---|---|---|---|---|---|---|---|
| menu | .85 | .55 | .2 | – | – | – | Dm(add11) – B♭, 4 bars per chord |
| explore | .7 | .6 | .35 | – | – | – | Dm9 – B♭maj7 – Fmaj7 – Cadd9 |
| solving | .5 | .25 | .7 | .55 | .5 | – | same progression, pad filter more open |
| complete | .8 | .7 | .3 | – | – | .8 | Dmaj9 – Gmaj7 – Em9 – Dadd9 |

Changing state crossfades the layer gains smoothly (about 2.5 s). The new harmony starts at the next chord boundary, so a transition never lands mid-phrase.

**Automatic phases** (`autoMusic`, on by default):
- `levelLoaded` / `chamberRestart` → explore
- `echoSpawned` → solving
- `loopDeleted` → solving or explore, depending on how many echoes remain
- `levelComplete` → complete

`complete` and `menu` are sticky until a new level or a restart. The app can always override with `setMusicState`.

## Mix, dynamics and voice limiting

```
category buses (footstep .8, mechanical .9, temporal 1, stinger 1, ambient .75, ui 2.4) → sfx bus ┐
music layers → music bus → musicFilter (pause / rewind tape sweep) ──────────────────────────────┤
reverb send → Convolver (procedural 3.4 s hall IR) → return .55 ──────────────────────────────────┤
                                                   master → glue comp (−20 dB, 3:1) → limiter (−4 dB, 20:1, 2 ms) → tanh soft clip → out
```

- **Volumes**: `setVolumes({master, music, sfx})` takes linear 0..1 values (Settings stores 0..100, so divide by 100). Values are clamped and given a perceptual x² curve. Master is capped at 0.9 for headroom. Every change is smoothed with `setTargetAtTime`.
- **Impulse response**: generated stereo noise with an exponential decay to −60 dB, progressively darker, decorrelated between L and R, with sparse early reflections.
- **Voice limiter** (`voices.ts`), applied when each one-shot asks to start:
  1. dedupe by key within 45 ms;
  2. burst limit (footstep 3, mechanical 6, ui 2 voices starting within ±50 ms);
  3. per-category polyphony (footstep 6, mechanical 14, temporal 6, ui 4, stinger 3, ambient 10);
  4. global limit of 64.

  Priorities are temporal/stinger/UI 3 > live player 2 > world 1.5 > echoes 1. A newcomer steals the lowest-priority, oldest voice when it is allowed to. Stolen voices fade out over 30 ms, so there are no clicks. The live player's footstep always gets through a crowd of echoes.
- **Spatialisation**: the listener is the player. Pan = Δx / 7 tiles, capped at ±0.85. Gain falls off past 2.5 tiles (minimum 0.22). A batch that spans several ticks is spread by tick offset (capped at 100 ms), so footsteps do not flam.

### Measured levels
Each recipe was rendered offline in Chromium through the full master chain at default volumes:
- No NaN values and no clipping. The loudest single cue is `restart` with a peak of 0.87.
- Typical peaks:
  - footstep 0.31
  - plate 0.40
  - door close 0.70
  - rewind 0.76
  - bloom 0.69
  - fanfare 0.76
  - UI 0.05–0.22
- Music runs at about −25 to −31 dBFS RMS and ambience at about −30 dBFS RMS.
- A real-time pass of the L01 solution dropped zero voices.

## API

```ts
import { createAudioSystem } from './engine/audio';
const audio = createAudioSystem({ volumes: { master: .8, music: .7, sfx: .9 } }); // seed?, scheduler?, autoMusic?, context?
addEventListener('pointerdown', () => void audio.unlock(), { once: true });   // autoplay policy
audio.handleEvents(game.drainEvents(), game.getState());                    // every frame
audio.setMusicState('menu' | 'explore' | 'solving' | 'complete' | 'silent');
audio.setVolumes({ master, music, sfx });
audio.setPaused(bool);                    // ducks loops and muffles the music
audio.playUi('hover' | 'click' | 'confirm' | 'back' | 'toggle' | 'error' | 'open' | 'close' | 'slider' | 'scrub');
audio.stats(); audio.recentCues(); audio.update(); audio.dispose();
```

Before `unlock()` the system is inert, and events are ignored rather than queued, so there is no burst of backlog when audio starts. Events from timeline scrubbing are already suppressed by the engine.
