# Progress — Game Director: final quality gate and polish pass

## Completed

1. **Gate run on the incoming tree:** `npm run verify` green (402 passed + 3 expected-fail QA repros, build OK)
   before any change.
2. **Play-tested every level in the real app** (headless Chromium, software WebGL, `?quality=medium`) via a
   scripted driver: each chamber loaded, its verified solution run to completion through `window.__RECURSION__`
   (all 10 completed), then reloaded and stopped mid-solve with echoes active for screenshots; plus main menu,
   expanded timeline, pause, settings and level-complete. Zero page errors; the only console message was a
   deprecated-shadow-map warning (fixed). Four screenshot → fix rounds, each compared against the concept sheet.
3. **Fixes from the review** (highest impact first):
   - *Characters too small / far* — follow distance `clamp(r·1.0, 15, 25)` (was `clamp(r·1.3, 16, 36)`), less
     pull toward the chamber centre. Player and echoes now read as silhouettes.
   - *UI covering the subject* — new damped projection view offset in `CameraRig` (`viewLift`, `viewShift`,
     `framingZoom`), exposed as `GameRenderer.setFraming()`; bootstrap lifts 6% in play, 16% with the timeline
     expanded. Overview distance now fits the chamber's foreshortened footprint into the free area above the panel
     (chambers were drawn at ~40% of the available space).
   - *Main menu backdrop dark and distant* — attract replay now uses a wider follow shot shifted right of the
     title column.
   - *Olive-green brass on every horizontal surface* (pillar caps, wall rails) — warm vaulted-ceiling band in the
     PMREM environment at 25–65° elevation.
   - *Visible 2 px full-frame chromatic fringe* — reduced to a subtle corner-only fringe.
   - *Black voids around chambers in overview* — solid wall mass plated with dark exterior deck tiles (same
     batched materials: no extra draw calls).
   - *Pillar 4, "which echo does what, when"* — new `EchoIntentLayer` (`src/graphics/effects/echoIntents.ts`):
     numbered badge + countdown ring above each object an echo will use in the next 4 s, flaring when it fires;
     fed read-only from `TemporalGame.getTimeline()` via the new `GameRenderer.setTimeline()`; respects hidden
     echoes; disabled in menus and during rewind playback.
   - *Tutorial card covering timeline inspect / preview* — tutorial and hint cards fade out while inspecting.
   - *Level-complete Best time precision mismatch* — both now `0:04.77`.
   - *L08 copy track shown as a second "Echo 1"* — copies labelled "Echo 1 ↻2", bar offset to `startTick` with
     dashed styling, played progress relative to start, no per-copy delete/hide buttons; hiding an echo also
     hides its copies in the 3D view.
   - Deprecated `PCFSoftShadowMap` → `PCFShadowMap` (removed the boot console warning).
4. **Deployable build** verified: `dist/index.html` references only `./assets/...` and `./favicon.svg`
   (relative base), three.js in its own chunk.
5. **Docs:** `README.md` (overview, controls, run/build/test/deploy, architecture, team) and
   `docs/agent-progress/release-notes.md` (honest status vs the Definition of Done + next milestones).
6. **Screenshots:** `docs/art-direction/screenshots/final-*.png` — menu, timeline (expanded, L03), pause,
   settings, complete, `L01…L10-midsolve`, and `-intent` shots where an echo action is imminent.

## Files changed

- `src/engine/rendering/CameraRig.ts` — follow distance, framing offset (lift/shift/zoom), overview fit.
- `src/engine/rendering/GameRenderer.ts` — `setFraming()`, `setTimeline()`, intent layer, shadow type.
- `src/engine/rendering/quality.ts` — shadow type.
- `src/engine/rendering/environmentMap.ts` — warm ceiling band.
- `src/graphics/shaders/grade.ts` — chromatic aberration.
- `src/graphics/environment/kit.ts` — deck plating on solid wall mass.
- `src/graphics/effects/echoIntents.ts` (+ `.test.ts`) — new.
- `src/app/bootstrap.ts` — framing, timeline to renderer (computed once per frame), attract camera.
- `src/app/flow.ts` (+ test) — hidden echoes also hide nested-loop copies.
- `src/app/debugHook.ts` — `runSolution({ untilTick })`.
- `src/ui/createUI.ts`, `src/ui/styles.ts` — inspect mode hides tutorial/hint cards; copy-span style.
- `src/ui/menus/Overlays.ts` — Best time precision.
- `src/ui/timeline/model.ts`, `TimelinePanel.ts` (+ test) — nested-loop copy tracks.
- `tests/e2e/visual.spec.ts-snapshots/*` — 4 3D baselines re-blessed after reviewing actual/expected (camera
  distance, brass colour, fringe, deck plating; no unintended differences).
- `README.md`, `docs/agent-progress/release-notes.md`, this file, `docs/art-direction/screenshots/final-*.png`.

Contract/shared-file notes: `GameRenderer` interface gained two methods (additive). `TrackModel` gained
`recursion`/`startTick` (additive). No simulation, physics, gameplay or level data was changed; golden replays
untouched.

## Tests run (real results)

- `npm run verify` (start): typecheck clean; 24 files, 402 passed + 3 expected-fail; build OK.
- `npm run verify` (after changes): typecheck clean; 25 files, **406 passed + 3 expected-fail**; build OK.
- `CI=1 E2E_PORT=4312 npx playwright test` (full suite, 23.3 min): **11 passed, 4 failed** — the four 3D
  visual-regression scenes, 21–28% pixels different, all from the intended visual changes (reviewed side by side).
  All flows, smoke, all-10-levels sweep, Continue/restart, perf probe and both UI visual tests passed.
- Re-blessed the 3D baselines (`--update-snapshots -g "3D scenes"`: 4 passed), then re-ran
  `npx playwright test tests/e2e/visual.spec.ts`: **6/6 passed**.
- Perf probe (software rendering, meaningless for real GPUs): L10 high 0.41 fps / 500 draw calls (was 567),
  low 0.47 fps / 344 draw calls.
- Static deploy check: copied `dist/` to a sub-folder (`/games/recursion/`) of a plain `python -m http.server`;
  the game booted to the main menu with no page errors and no 4xx/5xx responses.
- Screenshot driver: all 10 levels completed with their verified solutions in the real app; no page errors.

## Outstanding issues

- Real-GPU performance and feel unmeasured (the single biggest risk).
- QA-1/2/3 physics edge cases still open (gameplay/engine owners).
- Intent badges cover interactions only (not walk-on plates); no ghost paths during Q preview.
- Visual fidelity below the concept sheet (simple character, repetitive walls, unrendered decor types).
- `?quality=` override not reflected in the Settings screen; attract replay keeps running under menu sub-screens.

## Dependencies / next tasks

- Hardware: run `npm run test:e2e:perf`, tune presets, camera damping, intro timing.
- Gameplay/engine: fix QA-1/2/3, flip their repros.
- Graphics: plate indicators, Q-preview ghost paths, decor vocabulary, character fidelity, reduced-motion/camera
  sensitivity API.
- Level design: human playtests of L05–L09; tune hints and par times.
