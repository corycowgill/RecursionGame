# Progress — Graphics / Technical Art Director (Agent 4)

## Completed
- **Renderer facade** `createGameRenderer(container, { quality, introOnLevelLoad, preserveDrawingBuffer })` in
  `src/engine/rendering/` (import from `src/engine/rendering/index.ts`). It returns:
  - `setLevel(level, initialState?)`
  - `render(state, prevState, alpha, events?, dtSeconds?)`
  - `resize(w?, h?)`
  - `setQuality('low' | 'medium' | 'high')` / `getQuality()`
  - `setCameraMode('follow' | 'overview' | 'intro')` / `getCameraMode()`, `playIntro()`
  - `getCameraYawStep()`, which feeds `InputSampler.yawStep`
  - `stats()`, `dispose()`, `domElement`, `camera`

  It reads only `SimView` and `SimEvent` and interpolates actors and entities between ticks with `alpha`.
  Nothing is written back to the simulation.
- **Pipeline:**
  - WebGL2 with ACES Filmic, sRGB, PCF soft shadows fitted to the level bounds.
  - A custom PMREM warm/cool environment.
  - EffectComposer: RenderPass (half-float), UnrealBloom (threshold 1.0, so it feels selective),
    OutputPass, a grade pass (contrast, saturation, split-tone, vignette, grain, plus rewind, glitch and
    flash effects), then SMAA or FXAA.
  - Quality presets control pixel ratio, shadows, bloom, AA, particles, point-light budget, motes, shafts
    and trails.
- **Camera rig:**
  - 30° FOV three-quarter iso at a 43° pitch.
  - Yaw follows the `InputSampler` convention (a unit test checks this).
  - Critically damped follow with lead, mouse-wheel zoom, overview framing, and a level-intro fly-in that
    hands off to follow.
- **Modular environment kit** from the tile grid:
  - Floors: beveled tiles in three procedural variants, per-instance colour and rotation, sitting on a
    foundation slab.
  - Platform edges: brass lips and amber glow.
  - Wall heights depend on class: tall back/side walls with pilasters, conduits, sconces and arch niches;
    glass partitions; low front parapets. The camera never loses the player.
  - Pillars with gold banding, railings, stairs for ramps, and a keel under the chamber.
  - Decor: `conduit`, `observationWindow`, `ring`, `lamp`. Unknown types are ignored.
  - Instanced batching throughout.
- **Monumental backdrop:**
  - Sky dome shader and two cloud-sea layers.
  - 70 instanced towers with lit windows and spires, a colossal arcade and bridges.
  - Rotating clockwork rings and a halo ring.
  - Light shafts and GPU-animated dust, energy specks and embers.
  - Exponential fog for depth.
- **All 12 puzzle visuals** (shape + motion + colour). See art bible §8. Signal wires are floor ribbons
  that stream toward the target when the source is powered.
- **Character:** a primitive-built protagonist (suit panels, gold accents, backpack temporal device,
  ponytail) with procedural idle breathing, a distance-locked run cycle, a carry-overhead pose, an
  interact reach and hair secondary motion.
  - Echoes use the same silhouette with a holographic fresnel/scanline shader, a per-index tint, a hex
    number badge, a ground halo, a ribbon trail, a manifest dissolve and a divergence flicker.
  - X-ray silhouettes (GreaterDepth) keep every actor readable behind geometry.
- **Event-driven VFX:** recordStart rings and spiral, rewind screen distortion with implosion, echo
  manifest column and burst, interaction sparkles, door sparks, coral divergence glitch, plate, socket,
  receiver and portal feedback, and a level-complete flash with fountain.
- **Preview page** `graphics-preview.html` + `src/graphics/preview.ts` (registered as a Vite multi-page
  input). Scenes:
  - `?scene=chamber`: the real TemporalGame. Echo 1 holds the plate, Echo 2 replays the exit run, and the
    player follows a script.
  - `?scene=level&id=<id|order>`: any campaign level replaying its verified solution.
  - `?scene=showcase`: a render-only fixture with all 12 kinds.

  Deterministic screenshot mode: `?t=<tick>&settle=<frames>` sets `window.__PREVIEW__.ready`.
  Capture tool: `src/graphics/tools/capture-screenshots.mjs`, run against `npx vite --port 5199`.
- **Iteration:** 7 screenshot rounds, all looked at; the full history is in
  `docs/art-direction/screenshots/` (`v1` → `v7`).
  - Fixed a decor ring blocking the view and halo teeth showing as giant black blocks.
  - Replaced a monotone blue-grey floor with warm variants, and reworked locker-like walls into panels
    plus arch niches.
  - Lowered the camera to a less top-down angle and brought it closer, and scaled characters 1.15×.
  - Reduced the cyan cast and over-bloom; holograms no longer turn into white blobs.
  - Cut a door lintel that hid the player, and added X-ray silhouettes.
  - Lowered draw calls through mesh merging (chamber 461 → 381, showcase 766 → 540).
- **Docs:** `docs/art-direction/art-bible.md`.

## Files
New, all inside my ownership:
- `src/engine/rendering/{index,GameRenderer,CameraRig,PostFX,environmentMap,quality}.ts`
- `src/engine/rendering/camera.test.ts`
- `src/graphics/materials/{palette,textures,library}.ts`
- `src/graphics/shaders/{hologram,fx,grade}.ts`
- `src/graphics/environment/{grid,batcher,kit,backdrop,wires}.ts`
- `src/graphics/environment/grid.test.ts`
- `src/graphics/entities/{types,index,mechanisms,items,energy}.ts`
- `src/graphics/animation/{character,actorVisual}.ts`
- `src/graphics/effects/{particles,vfx}.ts`
- `src/graphics/preview.ts`, `src/graphics/tools/capture-screenshots.mjs`
- `graphics-preview.html`
- `docs/art-direction/art-bible.md`, `docs/art-direction/screenshots/v*-*.png`

Shared file, a small additive change: `vite.config.ts` gained `build.rollupOptions.input` with `main`
(index.html) plus `graphicsPreview` (graphics-preview.html), as the task requested. No dependencies were
added and `package.json` is untouched.

## Tests run (actual results)
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 15 files, **154/154 passed**. My new tests (7) cover render-grid parsing, damped
  spring convergence and frame-rate independence, camera yaw matching `rotateStep` for steps 0/1/2/6, and
  intro → follow hand-off.
- `npm run build`: success. It emits `index.html` and `graphics-preview.html`.
- `npx playwright test`: **1 failed, not caused by graphics.** `smoke.spec.ts` expects the HUD to contain
  "Test Chamber", but the app now boots campaign level "First Echo" (`CAMPAIGN_LEVELS[0]` was added by the
  level designer). The app still uses `BootView`, so my renderer is not on that path yet. The fix belongs
  to QA/director: assert the first campaign level's name.
- Headless Chromium (swiftshader) screenshots: no page errors or shader errors in the final runs. The only
  console error is a 404 for `/favicon.ico`.

## Integration guide for the director (replace BootView in `src/app/bootstrap.ts`)
```ts
import { createGameRenderer } from '../engine/rendering';
const view = createGameRenderer(appRoot, { quality: 'high' });
// loadLevel:
game.loadLevel(level); view.setLevel(level, game.getState());
// frame:
const events = game.drainEvents();          // fan out the same array to audio/UI
view.render(game.getState(), game.getPreviousState(), stepper.alpha, events, dt / 1000);
keyboard.sampler.yawStep = view.getCameraYawStep();   // or wherever the InputSampler lives
// commands: Tab/overview -> view.setCameraMode('overview' | 'follow'); settings -> view.setQuality(...)
// dispose: view.dispose()
```
- `render` takes `dtSeconds`. If it is omitted, the renderer measures `performance.now()` itself.
- Pass **every** drained event, including meta events such as `rewind`, `echoSpawned` and
  `levelComplete`, because the VFX depend on them.
- The renderer appends its own canvas to the container and listens to window `resize` and container
  `wheel`.

## Outstanding issues / caveats
- In headless swiftshader one frame takes about 1–2 s, so screenshots are slow. A real GPU is needed for
  frame-time numbers; FPS has not been measured on hardware.
- Wire ribbons follow cell floor heights, so a wire crossing a height step slopes through the plinth edge.
  It needs proper vertical risers.
- The exterior faces of perimeter walls (visible only in overview and intro) are plain and dark.
- The X-ray silhouette is a capsule, not the true body shape (cheap by design).
- Carried items use the overhead anchor for every carriable kind. An energy cell could use a two-handed
  chest pose instead.
- Entity visuals for timedSwitch, energyCell/Socket, elevator, laser*, temporalGate and movingPlatform
  are built against the contract State fields and the showcase fixture. Re-check them once the gameplay
  behaviours land, for example where a seated cell's `x/z/y` actually sits, and laser `beamLength`
  semantics (I assume units measured from the emitter cell centre).
- The bundle is still one big chunk (three.js); `manualChunks` would help.

## Dependencies on others
- **Director:** wire `createGameRenderer` into bootstrap (guide above), delete `BootView`, add a favicon,
  and fix the smoke test's level-name assertion.
- **Gameplay:** keep the documented State fields (`beamLength`, `progress`, `y`/`moving`, `dx`/`dz`,
  `socketId`, `remainingTicks`). The visuals depend on them.
- **Levels:** decor types `conduit`, `observationWindow`, `ring` and `lamp` are supported. Wall-mounted
  decor can be authored on the wall cell or on the floor cell in front of it, using `facing` toward the
  room. `camera.yawStep`, `zoom` and `focus` are honoured.
- **UI:** the screen effects come from the renderer. The UI may want `setQuality` and camera-mode toggles in
  settings.

## Next tasks
1. Once wired into the app, profile on real hardware and tune the presets (and check for 60 FPS).
2. Add vertical wire risers, plus in-world "which echo activates what, when" indicators (ghost markers
   from `getTimeline()`).
3. Temporal preview (Q): render `getSnapshotAt(t)` echoes as faint ghosts.
4. Detailing for perimeter wall exteriors, more decor types (machinery, banners, consoles), and a
  per-level backdrop seed and palette.
5. Level-complete camera move, plus a hit-stop on divergence.
