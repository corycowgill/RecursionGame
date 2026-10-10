# Progress: Game Director, vertical-slice integration

I own `src/app/**`, `src/main.ts`, `index.html` and `vite.config.ts`. I did not commit anything.

## Completed
- **App state machine** (`src/app/bootstrap.ts`):
  - Main flow: boot → main menu → level intro → playing → level complete → next level / replay / chambers / menu.
  - Within `playing`, the sub-states are pause menu, timeline-inspect, temporal preview and rewind playback.
  - Transitions use the UI's fade (`ui.transition`), guarded against double starts.
- **Frame loop:**
  - `FixedStepper` runs at 60 Hz with interpolation alpha. Each frame: keyboard → `TemporalGame.step` → `drainEvents()` once.
  - The same event batch goes to `GameRenderer.render`, `ui.onEvents` and `audio.handleEvents`. Audio is called every frame, as its author asked.
  - `InputSampler.yawStep` is set from `renderer.getCameraYawStep()`.
  - Gameplay state lives only in TemporalGame. The app only decides which view to show and which inputs to feed.
- **Commands:**
  - **R** ends the take, makes an echo and rewinds. Before committing, the app samples exact snapshots of the pass with `getSnapshotAt` and plays them backwards for 0.62 s (0.16 s with reduced motion), alongside the renderer's rewind effect and the audio rewind. At the echo limit, R discards the take instead (the engine emits `echoLimitReached` and the UI shows a toast).
  - **Shift+R** restarts the chamber.
  - **Tab** opens the timeline: the sim pauses and the camera switches to overview. Scrubbing renders `getSnapshotAt(tick)` in the 3D view, and PLAY/PAUSE lets the sim run with the timeline open.
  - **Esc** closes sub-screens or the timeline, otherwise pauses or resumes.
  - **Q (hold)** is the temporal preview: the overview camera fast-forwards (2.5×) through the rest of the loop. Echoes keep acting and the player idles; the engine's preview path is used and the live state is untouched.
  - **1–5** select an echo. **Delete/Backspace** and the timeline's delete button remove the selected loop. The eye toggle hides an echo from the rendered copy of the state only.
- **Level-complete flow:** `completionFromEvents` → `SaveStore.recordResult` → results card after 1.5 s, so the completion effects and stinger can land first.
- **Persistence:**
  - Echoes are saved to the save file as soon as they are committed, deleted or cleared.
  - **Continue** resumes the last unfinished chamber and restores its saved echoes.
  - Settings apply live: quality goes to `renderer.setQuality` (the 'ultra' setting maps to 'high'), and volumes to `audio.setVolumes` divided by 100. Key binds take effect immediately through the keyboard resolver (below). Tutorials-seen and progress are saved.
- **Main-menu backdrop:** the real simulation replays the continue chamber's verified solution, seen through the overview camera, and restarts when it completes or runs out of time. Music is in its menu state.
- **Audio:** unlocks on the first pointerdown or keydown. UI sound cues call `audio.playUi`. Pausing calls `audio.setPaused`.
- **Debug hook `window.__RECURSION__`** (`src/app/debugHook.ts`):
  - Reads: `getState`, `hash`, `echoes`, `mode`, `levelId`, `levels`, `screen`, `timelineExpanded`, `lastResult`, `progress`, `renderStats`, `audioStats`, `inputDebug`.
  - Drivers: `loadLevel(idOrIndex)`, which skips the intro, and `startLevel`, which goes through the normal flow.
  - `runSolution({instant})` installs the verified echo loops with `setLoops` and plays the final run's inputs, either synchronously or as an autopilot at 60 Hz.
  - Also `stepIdle(n)`, `commit`, `restart`, `goMenu`.
  - Everything goes through TemporalGame's public API.
- `?quality=low|medium|high` overrides the quality preset without saving it (used by the e2e tests). `?capture` keeps the drawing buffer.
- Removed the interim `src/app/bootView.ts`. Added `public/favicon.svg`. Split three.js into its own chunk in `vite.config.ts`.
- **E2E:** rewrote `tests/e2e/smoke.spec.ts` and `playwright.config.ts`. `E2E_PORT` overrides port 4173 so parallel agents can't reuse each other's servers. There are 3 tests:
  1. Menu → Continue → intro → Begin → move east with the real keyboard → R → Echo 1 replays the walk on its own → Tab timeline (sim frozen) → hold Q preview (sim frozen, then resumes) → Esc pause / Esc resume → solve via the hook → level-complete card → progress saved → Next chamber → L02 plays.
  2. Every campaign level loads, renders (draw calls > 20) and completes with its verified solution.
  3. Commit an echo → reload → Continue restores 1 echo → Shift+R clears it.

  All three assert that there were zero page errors and zero console errors.
- **Screenshots** (reviewed): `docs/art-direction/screenshots/integration-01-menu`, `-02-intro`, `-03-playing`, `-04-echo`, `-05-timeline`, `-05b-preview`, `-06-pause`, `-07-complete`, `-08-level2`, `integration-level-01..03`.

## Shared-file changes (minimal, additive)
- `src/engine/input/KeyboardInput.ts` (temporal engineer's module):
  - Optional `resolver(code, shift) → action name`, wired to `resolveKeyAction(save.keybinds, …)` so remapped keys work. Without a resolver it uses the old default layout.
  - Held keys are tracked per code, so W and ArrowUp held together don't cancel each other.
  - **Bug fix:** directions were dropped if a key was pressed in the frame before `gameplayEnabled` turned on (for example, right after clicking Begin).
  - Tab, Space and arrows are only `preventDefault`ed during gameplay, so menus keep keyboard focus navigation.
  - Added a public `releaseAll()`.

  Existing input tests still pass.
- `vite.config.ts`: `manualChunks` puts three.js in its own chunk.

## Tests run (real results)
- `npm run typecheck`: clean.
- `npm test`: 17 files, 184/184 passed. That is the previous 180 plus 4 new tests in `src/app/flow.test.ts`: quality mapping, every level solved through the attract/debug path, rewind sampling leaves the live hash untouched, and the echo-visibility filter.
- `npm run build`: success.
- `CI=1 npm run test:e2e`: 3/3 passed in 6.4 min (headless Chromium on SwiftShader, about 2 fps). No servers left running.

## Honest evaluation of the slice
- **Gameplay feel:** the record → rewind → cooperate loop works end to end through the real input path. Echoes replay the inputs, and the backwards rewind playback sells the mechanic. I could not judge feel at 60 fps here (SwiftShader runs at about 2 fps), so input latency, camera follow and the length of the intro fly-in still need checking on real hardware.
- **Visual quality:** the chamber, lighting, holographic echoes, HUD and timeline read close to the concept sheet. The menu backdrop is a bit dark and far away. Low quality was used for the tests.
- **Puzzle clarity:** the tutorial cards plus the objective and timeline explain levels 1–2. There are no in-world "which echo activates what, when" indicators yet (pillar 4). The onboarding card stays on screen during timeline inspect and preview and covers part of the view.
- **Reliability:** deterministic, no console errors, and saves survive a reload.

## Outstanding issues
1. Only 3 of 10 levels exist (L04–L10 are not authored, and L08 needs a nested-loop contract).
2. Performance has not been measured on a real GPU. The three.js chunk is 671 kB (193 kB gzipped).
3. The renderer has no API for `cameraSensitivity` or `reducedMotion` (camera shake), so those settings are saved but only affect the UI and the rewind playback length.
4. Echo visibility is done by filtering the rendered state. A carried crate whose hidden carrier is filtered out falls back to its sim position.
5. The temporal preview shows echoes moving at 2.5× but draws no ghost trails or path lines. The renderer would need a ghost layer.
6. Level-complete card: the time shows 2 decimals and Best shows 1 (UI formatting).
7. The `?quality` override is test-only; the e2e tests can't exercise high quality on SwiftShader in reasonable time.
8. The e2e suite is slow (about 6 min) because of software WebGL.

## Next tasks
- Profile on real hardware and tune presets. Consider pausing the attract replay while the level-select or settings screens are open.
- Renderer APIs: `setCameraSensitivity`, `setReducedMotion`, a ghost/preview layer for Q, and per-echo hide/ghost.
- Hide the onboarding card while the timeline is inspected or the preview is held (UI).
- Author L04–L10 and add their solutions to the e2e level sweep, which picks them up automatically from `LEVELS`.
- Add a gamepad input source behind the same resolver and command interface.
