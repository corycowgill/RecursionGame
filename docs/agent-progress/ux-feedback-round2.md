# Progress: UX & feedback engineer, round 2

Ownership: `src/graphics/effects/**`, `src/engine/rendering/**`, `src/app/**`, `src/ui/**`, `src/persistence/**`.
No simulation, gameplay, level or golden-replay changes. The replay hashes were not regenerated because nothing
here changes the simulation.

## Completed

### 1. Echo forecast: one source for the Q ghost paths and the walk-on badges
Both features need to know where every echo will be in the future. The only source of truth for that is the
simulation, through `getSnapshotAt(future)`, which replays the echoes and keeps the player idle (the Q-preview
assumption). Sampling the live game is too expensive while the clock runs: its preview cache is dropped every tick,
and a 480-tick window cost 35–134 ms per refresh in a measurement.

- `src/app/forecastEngine.ts` (`ForecastEngine`) keeps its own private `TemporalGame`. It loads the same level and
  loops, replays the player's recording up to the live tick (the sim is deterministic, so it matches bit for bit;
  a unit test checks this), then samples ahead every 6 ticks with a stable cache. It stops when every echo has
  finished or the loop ends. It reuses its replay when the recording prefix matches.
- `src/app/forecast.worker.ts` runs that engine in a **Web Worker**, so the main thread pays nothing. Vite emits it
  as `assets/forecast.worker-*.js` (about 43 kB). Where workers are unavailable (tests), `InlineForecastBackend`
  runs it time-sliced at 3 ms per frame.
- `src/app/forecast.ts` (`EchoForecastController`) decides when to re-forecast:
  - a new pass (the loop set changed, a rewind, a reset or a level load);
  - a `divergence` event;
  - a pickup, drop or use by the player;
  - live echoes drifting more than 0.3 tile off the forecast (for example, a crate parked in an echo's path);
  - pressing Q.

  Event-driven refreshes are rate-limited to one per 20 ticks. The old forecast stays on screen until the new one
  starts arriving, so nothing flickers. Results are cached by version, so the renderer only rebuilds geometry when
  something changes.
- Pure derivations are in `src/graphics/effects/forecast.ts`: `walkOnTriggers`, `sampleOf`, `ForecastSampler`,
  `extractGhostPaths`, `scheduleWalkOns` and `forecastDeviation`.

### 2. Q temporal preview ghost paths
`src/graphics/effects/ghostPaths.ts` (`GhostPathLayer`, via `GameRenderer.setGhostPaths`):
- Each echo gets a dashed floor ribbon in its tint (the cyan family), drawn from the preview start to where it stops.
- The part the preview playhead has passed dims, and there is a glow at the playhead.
- A diamond tick marker sits at every second, with a bigger marker and a "2s" / "4s"… caption every two seconds.
- The echo's numbered hex badge sits at the end of the path.
- Nested-loop copies are drawn slightly offset and badged `1′`. Hidden echoes and their copies are left out.
- The dashes flow toward the future, but stay still with reduced motion.

The app sets the paths only while Q is held and passes `null` otherwise, so they clear on exit.

### 3. Walk-on indicators
`EchoIntentLayer.setWalkOns` (via `GameRenderer.setWalkOns`) adds badges over pressure plates and 'ride'-mode lifts:
- The badge uses a segmented ring ("step here") instead of the solid ring that interaction badges use.
- It counts down over the last 4 s before the echo steps on, then flares when it lands.
- While the echo stands there, a dim steady ring stays up ("held by echo N"). This includes finished echoes parked
  on a plate.
- Badges that share an object stack by base height and never overlap.
- The badges show in the live view and the Q preview, but not while scrubbing the past.

The pool grew from 12 to 20 badges, and reduced motion removes the bob and pulse.

### 4. Camera sensitivity and reduced motion wired into the renderer
New API `GameRenderer.setComfort({ cameraSensitivity, reducedMotion })`. The mapping is the pure function
`src/engine/rendering/comfort.ts` (`comfortParams`):

- **Sensitivity:**
  - mouse-wheel zoom rate × s;
  - follow/pan spring times × 1/√s. `CameraRig.setSmoothing` controls these springs.
- **Reduced motion:**
  - no camera shake;
  - the intro fly-in drops from 3.4 s to 1.1 s and loses its orbit/height swing;
  - rewind warp and divergence glitch × 0.2;
  - flashes × 0.45;
  - VFX particle bursts × 0.5 (`VfxSystem.setIntensity`);
  - movement look-ahead × 0.35;
  - ambient motes drift at a third of the speed;
  - no badge bob and no ghost-path dash flow.

Camera shake is new and trauma-based (`CameraRig.addShake`). `VfxSystem.onShake` fires it on rewind/restart (0.18),
divergence (0.32) and level complete (0.4). Before this, "Disables camera shake" in Settings referred to nothing.

The app applies comfort at boot and on every settings change. The Settings help text now says "Mouse-wheel zoom
and camera follow speed", because the camera has no free orbit. "Mouse influence" is therefore read as the
wheel-zoom rate.

### 5. `?quality=` override shown in Settings
- `qualityOverrideOf()` in `src/app/flow.ts` validates the URL value against the Settings presets. An unknown value
  now falls back to the saved preset; before, it forced 'high'.
- `createUI(..., { qualityOverride })` and `createSettings(..., opts)` show the override as the active preset and
  lock the selector. The help text reads, for example, "Set by the ?quality=low URL option for this session. Saved
  preset: Ultra."

### 6. Attract replay paused under menu sub-screens
`attractSuspended(mode, screen)`: while settings, level select or credits cover the main menu, the attract sim is
paused. The backdrop then redraws only every 500 ms (the canvas keeps its last frame), which also covers resizes.

### 7. Crate carried by a hidden echo (decision: hide it with the echo)
In `GameRenderer.syncEntities`, a carried item whose carrier has no visual is hidden. Every actor in the view gets a
visual first, so a missing carrier always means the app filtered out a hidden echo.

Rationale:
- The old fallback, the item's simulated position, floated a crate where nobody is visible.
- Drawing it at the hidden echo's carry anchor would show a disembodied crate gliding along the echo's path, which
  defeats the point of hiding the echo.

Hiding is the presentation rule: everything the echo holds belongs to that echo. The simulation is unaffected, and
the crate reappears when the echo is shown again or drops it.

### Debug hook
`window.__RECURSION__.preview(tick | null)` holds the Q preview frozen at a tick, and `forecastStats()` reports the
forecast's sample, walk-on and ghost-path counts. Both are used for the screenshots.

## Files
- New:
  - `src/graphics/effects/forecast.ts` (+ test)
  - `src/graphics/effects/ghostPaths.ts` (+ test)
  - `src/engine/rendering/comfort.ts` (+ test, which also covers `CameraRig` shake, intro and zoom rate)
  - `src/app/forecast.ts`, `src/app/forecastEngine.ts`, `src/app/forecast.worker.ts` (+ `src/app/forecast.test.ts`)
- Changed:
  - `src/graphics/effects/echoIntents.ts` (+ test), `src/graphics/effects/vfx.ts`
  - `src/engine/rendering/CameraRig.ts`, `src/engine/rendering/GameRenderer.ts`
  - `src/app/bootstrap.ts`, `src/app/flow.ts` (+ test), `src/app/debugHook.ts`
  - `src/ui/createUI.ts`, `src/ui/menus/Settings.ts`, `src/ui/styles.ts`, `src/ui/ui.test.ts`

Interface notes (all additive):
- `GameRenderer` gained `setWalkOns`, `setGhostPaths` and `setComfort`.
- `CreateUIOptions` gained `qualityOverride`.
- `createSettings` gained a fifth optional argument.
- `DebugHook` gained `preview` and `forecastStats`.

## Tests run
- `npm run verify` (final run): typecheck clean · 29 files, 446 passed · build OK (the worker chunk is emitted).
- Screenshots: the production build was served with `vite preview` from the scratchpad. The dev server was not used,
  because concurrent edits elsewhere trigger HMR reloads mid-capture.
  - The driver is `$SCRATCHPAD/shot.mjs <level> <untilTick> <previewTick> <tag>`.
  - L01 at tick 40, with the preview at 120: a dashed ghost path from the echo to the balcony plate, the end badge,
    and the segmented walk-on badge stacked above the plate. No page errors.
  - L06 with 3 echoes, solution stopped at tick 100, preview held at 170: three dashed trails in distinct echo
    tints, with second markers, "2s" captions, end badges and walk-on badges over the plates. No page errors.

## Outstanding / notes for the director
- **e2e:** the UI and flow specs should be unaffected. The 3D visual baselines use `graphics-preview.html`, which
  does not set walk-ons or ghost paths, so they should be unchanged. A small camera shake can now follow
  rewind/divergence/complete events; it decays within about 0.5 s, so settle frames hide it.
- Under SwiftShader (about 0.5 fps) the main thread only picks up worker results once per frame, so the first
  forecast shows after several frames. On a real GPU that is about 100 ms.
- The forecast assumes the player idles, as the Q preview does. Walk-on badges are therefore predictions and update
  as the player acts.
- The echo high-contrast palette is still not used by 3D tints (the badges use `echoTint`), as before.
