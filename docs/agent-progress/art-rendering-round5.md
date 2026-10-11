# Art & Rendering Director: round 5

Owner: `src/graphics/**`, `src/engine/rendering/**`. No commits (the director handles git). Every number below was
measured in headless Chromium on SwiftShader (software WebGL), on a 4-CPU machine shared with the other teams (load
average 7–9 during most runs). Absolute times are therefore not representative of a real GPU. Before/after pairs were
run alternately against two frozen production builds (`dist-before` = the tree at the start of this round,
`dist-after` = this round's code), both in the scratchpad.

## Summary

| Task | Result |
|---|---|
| Per-chamber lighting moods | **Done.** 10 moods in 5 wings, chosen from the level id by a graphics-side table (`src/graphics/environment/moods.ts`). Each sets key / rim / fill colour and **sun direction**, exposure, fog, grade, practical-lamp tint, sky, cloud sea, haze, backdrop accents and the material variant. Gameplay colours untouched (unit test). |
| Shader precompile | **Done, measured.** The first echo used to stall a frame for 7–21 s under SwiftShader (2 shader programs linked inside that frame). Now **no long task at all** at first echo spawn (6/6 runs). Cost moved into the level load. |
| Turntable head tilt + face / hair | **Fixed / polished.** The tilt was a rotation-order bug (yaw and pitch composed in XYZ order, so a turned head rolled when it looked up or down). Face: irises, pupils, catchlights, lash line, brows, nose, mouth; softer hair. |
| Material variety + wear masks | **Done.** Oxidised brass (Dawn), clean satin (Lab), grime and drips (Machine Hall), lacquer and aged gold (Paradox), polished chrome-gold (Core). Shader hook on the shared materials, driven by uniforms only: **no new draw calls, textures or per-level programs**. |
| L10 draw calls ≤ 376 high / 255 low | **Met.** Same method on both builds: high **357** (before 356), low **233** (before 232); the +1 is the level designer's new L10 wire. |
| Mid-solve screenshots, ≥ 2 review rounds | **Done, 3 rounds** (scratchpad only, see "Screenshots"). |

## 1. Chamber moods

`moodFor(level)` maps the id prefix (`L01`…`L10`) to a `ChamberMood`. Unknown ids (test chamber, showcase) get
`DEFAULT_MOOD`, which reproduces the old hard-coded values exactly (unit-tested), so the chamber and showcase visual
baselines are unaffected by the moods.

| Wing | Chambers | Light | Backdrop accent | Materials |
|---|---|---|---|---|
| Dawn Atrium | L01, L02 | low gold sun from the east (long morning shadows), rose-gold grade, peach horizon | warm gold crowns and rings, cyan secondary | oxidised brass (verdigris patina 0.5 / 0.42), light grime |
| Chronometry Lab | L03, L04 | neutral-white near-overhead key, strong cyan rim, teal haze | cyan | clean cool-white panels, satin brass (chrome 0.22) |
| Machine Hall | L05, L06 | amber furnace key from the west, smoky brown haze, stronger vignette | amber (kept on the gold side of the hazard hue) | brushed brass, heavy grime and wall drips (0.5) |
| Paradox Wing | L07, L08, L09 | warm-white side key, violet rim and fill, indigo dusk sky | violet / lilac | lacquered gunmetal, aged gold, light patina |
| The Core | L10 | white-hot near-overhead key, pale luminous haze, higher contrast | white-cyan, gold secondary | polished chrome-gold (chrome 0.6), no wear |

Each chamber differs from its wing neighbour (sun azimuth/height, haze, accent), so consecutive chambers never look
identical.

Guard rails (`src/graphics/environment/moods.test.ts`):
- every campaign chamber has its own mood; non-campaign ids get the default;
- no mood accent or practical tint sits closer to coral (hazard) than the authored gold / lamp colours already do.
  This caught two real problems during the round: the first Machine Hall amber and the salmon practical lamps planned
  for the Paradox Wing (both changed);
- the key light is never blue- or violet-dominant (the gold player and ivory suit must read) and stays in a safe
  intensity / exposure range;
- fog, wear amounts and patina saturation stay bounded (patina is a dull verdigris, never the "powered" teal).

Lessons from the review rounds, written into the table's doc comment and the art bible:
- the follow camera mostly sees floor, so a mood has to come through the key light, not only the sky. Round 1
  (colours only) left L01/L02 almost indistinguishable from the old look; round 2 added a **per-mood sun
  direction**, which made the dawn wing read immediately (long east-west shadows);
- a sun from the north at 40–55° elevation mirrors off the floors and brass straight into the 43° camera (round 2
  produced a blown-out orange glare in L09); round 3 moved the Paradox suns to the side.

Visual effect is a judgement call: **needs a playtest / art sign-off on a real GPU**, especially the Machine Hall
(warm floors) and the Paradox Wing (lavender-grey floors), and whether the long Dawn shadows ever hide something a
player needs to see (they are moderate: sun elevation ~36–44°).

## 2. Shader / material precompile

`GameRenderer.prewarm()` runs at the end of every `setLevel` (and after a quality change):
- the chamber itself (kit, entities, pooled VFX rings, intent badges, which already sit in the scene, visible or not);
- through off-scene stand-ins kept alive for the renderer's lifetime: an echo `ActorVisual` (hologram body, x-ray
  silhouette, halo, number badge, trail) and a one-path `GhostPathLayer` (Q-preview ribbons and dots). Keeping them
  alive keeps their programs in three.js's program cache, so every real echo reuses them.

It uses `renderer.compileAsync` when `KHR_parallel_shader_compile` exists (the compile then overlaps the intro fly-in
on a real GPU); without it (SwiftShader, some mobile GPUs) it compiles synchronously and queries each program once, so
the driver cannot defer the link to the first draw.

The important detail: programs depend on the **render target**. The scene is drawn into the composer's half-float
target (linear output, tone mapping left to the OutputPass), so the warm-up compiles against that target. My first
attempt compiled for the canvas: every program was built twice, the measured stall did not move at all (12–17 s), and
a WebGL call profile showed the 2 links still happening inside the first-echo frame. Compiling against the composer
target fixed it.

### Measurements (L01, record 1 s, press R; long tasks from `PerformanceObserver`)

| Build | Quality | Long task(s) on the first-echo frame, per run | Normal frame |
|---|---|---|---|
| before | high | 9.2, 12.7, 15.1, 15.7, 21.1, 11.2 s (median 13.9 s) | 3–5 s |
| **after** | high | **none, none, none** | 5–6 s |
| before | low | 7.4, 15.0, 15.5, 18.3, 16.8 s (median 15.5 s) | 2.5–6 s |
| **after** | low | **none, none, none** | 5–7 s |

WebGL call profile of the same moment (low quality, one run each, `glprof.mjs`):
- before: the frame in which the echo appears spends **9.65 s** in `getProgramInfoLog` / `getShaderInfoLog` (the
  driver finishing 2 program links: 4 `compileShader`, 2 `linkProgram`);
- after: **0** compiles in that frame, 13 ms of JavaScript, and the next frame arrives on the normal cadence.

Cost: the level load gets longer by the time those programs take to compile. Time from `loadLevel` to the third
rendered frame, under SwiftShader and heavy machine load: high before 16.8 / 19.5 / 22.6 s, after 29.4 / 31.1 / 51.0 s;
low before 23.7 / 24.3 / 26.4 s, after 21.8 / 29.2 / 34.5 s. Noisy, but roughly +5 to +10 s of software compile now
happens at load (behind the intro fly-in and the level card) instead of in the middle of play. On a real GPU with
parallel compile it should overlap the intro: **unmeasured, needs a real-GPU check**.

This should also remove the ~4 s menu stall the director measured in round 4 (attract replay reaching its first echoes),
because the attract chamber goes through the same `setLevel`; **not re-measured** this round.

## 3. Turntable head tilt, face and hair

- Cause of the tilt: neck and head used three.js's default `XYZ` Euler order, so the look pitch was applied about the
  *unturned* ear-to-ear axis; whenever the head was turned (the turntable looks at a camera 35° to the side) any pitch
  became a sideways roll. Neck and head now use `YXZ` (yaw, then pitch about the turned axis). The deliberate roll
  coupling (`-lookYaw x 0.08`) is down to 0.025.
- The look pitch used a 1.6 m eye height while characters are scaled 1.15x; it now uses `1.6 x CHARACTER_SCALE`.
- Face (merged into the existing head mesh, 0 extra draw calls, about +2.2k triangles per character): brown irises with
  pupils and catchlights (the eyes read as two black beads), an upper lash line, heavier brows, a slimmer nose ridge and
  a softer mouth. Hair: seven two-tone fringe locks, shorter bun wisps (they read as chestnuts), matte hair (the
  clearcoat caught the rim light as a hard blue blob on the crown). I also tried soft leaf-shaped locks; they sank into
  the hair cap and read as a jagged band, so I reverted to the tapered locks.
- Turntable tooling: `?focus=head` (head-and-shoulders close-up for face review), `?dist=`; the default full-body framing
  is closer (5.8 → 4.9 m) so the figure fills the frame like the concept turnaround. Studio rim light 2.2 → 1.9.
- Compared with the concept turnaround: the silhouette, palette and armour layout match; the head reads upright and
  engaged now. Still procedural: no hair strands, no hands detail, the head is slightly small for the shoulders.
  The front three-quarter shot is in the scratchpad (`shots/v3-Lturntable-high.png`, close-up
  `shots/v3head-Lturntable-high.png`); `docs/art-direction/screenshots/final-character.png` was **not** overwritten
  (screenshots stay out of `docs/` this round); the director can regenerate it with `?turntable=1&t=20`.

## 4. Material variety and wear masks

`src/graphics/materials/wear.ts` installs one `onBeforeCompile` hook per material kind (`metal` on brass and polished
brass, `wall` on wall panels, ivory and gunmetal, `floor` on every floor variant). It adds a world-space mask from
cheap value noise (2 octaves) plus vertical drips on walls and soft scuffs on floors, so instanced modules never repeat
the same blotch. Uniforms (shared objects owned by `MaterialLibrary`): `uPatina` (verdigris, less metallic, rougher),
`uGrime` (darker, rougher), `uChrome` (brass desaturated toward white gold / chrome, smoother) and `uWearOn` (skips the
noise entirely). `MaterialLibrary.applyMood()` also tints brass, gunmetal, panels and floors and sets the brass polish.

- No new draw calls, textures or atlases; programs are keyed by kind (`customProgramCacheKey`), so they compile once per
  renderer, never per level, and the warm-up covers them.
- All zero = an exact no-op (the default mood, test chamber and showcase render as before).
- New quality flag `materialWear` (`quality.ts`): on for medium / high, off for low / mobile (fill rate). The tints and
  a cheap colour-only chrome approximation still apply there.

## 5. Draw calls (L10)

Same deterministic method on both builds (`drawcalls.mjs`): the app at `?quality=…`, L10 loaded, the verified solution
stopped at ticks 240 / 480 / 720 / 960, 12 frames to let the camera settle, `renderStats()`.

| Quality | Before (max over 4 checkpoints) | After | Budget |
|---|---|---|---|
| high | 356 (356 / 313 / 286 / 289) | **357** (357 / 313 / 286 / 290) | ≤ 376 |
| low | 232 (232 / 189 / 162 / 165) | **233** (233 / 190 / 163 / 166) | ≤ 255 |

The constant +1 at every checkpoint is the level designer's new L10 wire (`socket-reliquary → gate-reliquary`, one wire
ribbon mesh; it is in the after build, not in the before build); nothing in this round's rendering work adds a mesh per level (moods change colours and uniforms,
accent materials are 1:1 replacements, the warm-up stand-ins are never in the scene). Triangles +0.6% (the face).
The perf probe (`tests/e2e/perf.spec.ts`, real-time autopilot) was not re-run; its 376 / 255 figures come from
whatever moment the 12 s sample ends on, so they are not comparable checkpoint by checkpoint.

## 6. Screenshots and review rounds (scratchpad only)

All in `/tmp/claude-0/-home-user-RecursionGame/d811f49f-971d-58c9-934c-1d8a5e76d32e/scratchpad/shots/`, made with
`graphics-preview.html?scene=level&id=N&t=<mid-solve tick>&settle=6&quality=high` (ticks 160, 270, 420, 440, 380, 410,
420, 650, 490, 580): `before-L*` (start of round), `r1-L*`, `r2-L*`, `r3-L*`, `final-L*`, `ov3-L*` (wider view
with the sky), side-by-side sheets `sheet-*.png`.

- Round 1 (colours only): Lab, Machine Hall, Paradox and Core already distinct; Dawn indistinguishable from the old
  look; Paradox floors too pink.
- Round 2: per-mood sun direction, Paradox key whiter and fill weaker, Core contrast up, Dawn warmer: Dawn now reads as
  morning; L09 got a mirror glare from a north sun.
- Round 3: Paradox suns moved to the side (glare gone), Dawn patina and Core chrome raised so they show at play distance.
- Against the concept sheet: warm interior vs. coloured exterior is kept in every wing; the concept's dominant
  gold/brass + cyan contrast is strongest in Dawn and Lab, deliberately shifted in the Machine Hall (amber) and the
  Paradox Wing (violet). The follow camera still shows mostly floor, so the backdrop variety is seen mainly in the intro
  fly-in, overview and menu.

## Files changed

New: `src/graphics/environment/moods.ts`, `src/graphics/environment/moods.test.ts`, `src/graphics/materials/wear.ts`.
Changed: `src/engine/rendering/GameRenderer.ts` (moods, sun direction, practical tint, warm-up, `getMood()`,
`whenWarm()`), `src/engine/rendering/quality.ts` (`materialWear`), `src/graphics/environment/backdrop.ts` (mood
colours), `src/graphics/materials/library.ts` (`applyMood`, wear hooks), `src/graphics/animation/character.ts`
(rotation order), `src/graphics/animation/actorVisual.ts` (eye height), `src/graphics/animation/characterModel.ts`
(face, hair), `src/graphics/turntable.ts` (`focus`, `dist`, framing).
Shared doc (additive): `docs/art-direction/art-bible.md` (section 4b chamber moods, wear masks, head look order, face).
No contract, level, simulation, UI or test-harness file touched; golden replays unaffected.

## Tests run

- `npx tsc --noEmit`: clean.
- `npx vitest run src/graphics src/engine/rendering`: 14 files, 75 tests passed (includes the new moods test).
- `npm run verify`: RESULT_VERIFY
- Visual baselines: RESULT_VISUAL

## Outstanding / for the director

1. **Visual baselines:** `l03-follow-low` and `l03-overview-low` are expected to differ (L03 now has the Lab mood);
   the chamber and showcase scenes use the default mood but include characters, whose faces changed slightly. Re-bless
   after review (`CI=1 E2E_PORT=… npm run test:e2e:update-snapshots`).
2. `docs/art-direction/screenshots/final-character.png` and the `final-L*` art-bible shots are stale; regenerate from
   the turntable and the game if you want them in `docs/`.
3. Real-GPU checks: warm-up overlap with the intro (parallel compile), the cost of the wear noise on mid-range GPUs,
   and an art sign-off on the five moods.
4. Not done: the menu-stall re-measurement, and colour-blind review of the Paradox Wing (violet accents next to the
   violet Echo 3 colour; L07–L09 use at most 2 echoes, so Echo 3 does not appear there today).
