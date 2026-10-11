# Mobile / touch UX engineer: round 3

Owner: `src/ui/**` (touch layer, responsive layout), `index.html` (meta tags only), `public/**` (manifest, icons), touch
wiring in `src/app/**`. Nothing is committed; the director handles git.

## Summary

The game can be played on an iPhone in landscape (Safari tab, or Add to Home Screen running full screen) with
on-screen controls. Touch produces the same `PlayerInput` / `GameCommand` stream as the keyboard and the gamepad:

- The joystick goes through the gamepad's `quantizeStick`, so the sampler only ever sees -1/0/1.
- The sampler rotates that direction by the camera yaw, the same as for every other device.
- Interact presses are latched in the same `InputSampler`.

The simulation, contracts and golden replays are untouched. `npm run verify` is green: typecheck clean, Vitest
37 files and 533 tests passed, build OK.

Everything was tested only in Chromium with iPhone 15 emulation (touch, isMobile, DPR 3, 852×393). Nothing was run in
real Safari or on a real device.

## What was built

**Input (`src/engine/input/InputSampler.ts`, a small additive change):** a third source, `touch`.
- `setTouchMove(x, y)` takes a quantized screen direction. `setInteract(down, 'touch')` latches like a key.
- Priority is keyboard, then pad, then touch. `releaseAll` clears the touch state.
- The existing API and behaviour are unchanged.

**Touch layer (`src/ui/touch/`)**
- `joystick.ts` (pure): a floating stick. The base appears under the thumb and is dragged along once the thumb passes
  the rim, so reversing direction is instant. It has a radial deadzone with hysteresis and snaps to 8 directions.
- `gestures.ts` (pure, `GestureTracker`), for every touch that does not start on a button:
  - one finger on the left half drives the joystick;
  - two fingers together pinch-zoom;
  - a quick, still two-finger tap toggles the puzzle overview;
  - a second finger after the stick has started steering is ignored.
- `visibility.ts` (pure): when things show.
  - Controls appear only on touch devices and only while touch was the last device used.
  - They show only while a chamber is being played with no menu open.
  - While the timeline sheet is open, only the pause button stays.
  - Portrait shows the rotate overlay instead.
- `TouchControls.ts`: the DOM layer, built on Pointer Events with multi-touch tracked per `pointerId`.
  - Joystick zone plus four right-hand buttons: Interact (86 px, gold), New echo (64 px), Timeline (56 px) and
    Preview, which acts while held (58 px). There is a 48 px pause button in the top corner.
  - Buttons act on pointerdown and use pointer capture, so a finger that slides off still releases.
  - Hiding the controls (pause, blur, page hidden) releases everything, so no input gets stuck.
  - The Interact button glows and shows the action name ("Pick up", …) when something is in reach.
  - Haptics use `navigator.vibrate` where it exists. On iOS that is a no-op.
  - Also contains the rotate overlay and the Add to Home Screen hint element.
- `holdButton.ts`: hold-to-confirm for **Pause → Restart chamber** on touch.
  - It shows a 0.75 s coral fill and a "Hold" tag that appears only on touch.
  - A mouse, keyboard or controller click still restarts instantly, so desktop flows and existing tests are unchanged.
- `env.ts`: iOS detection (including iPadOS reporting a Mac user agent), touch-first and standalone detection.
  The "dismissed" flag for the home-screen hint lives in `localStorage` with try/catch around it.
- `touchStyles.ts`: an injected stylesheet; `styles.ts` was not touched. It covers:
  - iOS hygiene: `touch-action: none` on the page, `overscroll-behavior: none`, no text selection, no long-press
    callout, no tap highlight. Screens that can overflow (menus, settings, pause, intro, the sheet) scroll inside
    themselves with `pan-y`.
  - Safe-area variables from `env(safe-area-inset-*)`.
  - The controls, the overlay and the hint.
  - A **compact layout** for `max-height: 520px` or `max-width: 760px`:
    - the HUD panels are compact;
    - the timeline collapses to a thin strip between the stick and the buttons ("Tap to open"), and expands to a
      bottom sheet with 2.5em lanes for drag scrubbing and 38–48 px targets;
    - the main menu shows the logo and the list side by side;
    - level select is a 5×2 grid;
    - settings, pause, intro and the completion card all scroll and are tightened up.
  - Touch targets are at least 44 px wherever touch is the active device.
- `glyphs.ts`: a new `InputDevice` kind, `{ kind: 'touch' }` (`TOUCH`). Tutorial cards and prompts name the on-screen
  button ("New echo", "Joystick") instead of a key. `createUI` starts in touch mode on touch-first devices. The first
  touch switches to touch mode, and keyboard or controller input switches back (that part is the gamepad engineer's
  existing `toKeyboard` / `activity` handling).
- Timeline (`TimelinePanel.touchMode`): in touch mode a tap anywhere on the collapsed strip opens the sheet, and the
  strip itself never scrubs. The sheet has a grab handle and a "Drag the tracks to scrub" hint.

**App (`src/app/touch.ts`, plus 12 lines in `bootstrap.ts`):** `wireTouch()` connects the layer to:
- the keyboard's `InputSampler`, for move and interact (gated on `gameplayEnabled`);
- the shared `onCommand` handler, for rewind, toggleTimeline, temporalPreview and pause;
- the camera: pinch zoom is sent as wheel deltas to `appRoot`, the same path the gamepad's right stick uses, so camera
  sensitivity applies. The two-finger overview calls `renderer.setCameraMode('overview')`.

It also:
- pauses a running chamber when the phone turns to portrait;
- unlocks audio on the first `touchend` (iOS requires it);
- cancels Safari's `gesturestart` / `gesturechange` pinch page-zoom;
- on the first touch, asks for fullscreen plus a landscape lock where the Fullscreen API exists (Android, iPad).
  This is skipped on iPhone, in standalone mode and under `navigator.webdriver`.

**PWA**
- `index.html`: viewport `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`,
  `apple-mobile-web-app-capable`, `mobile-web-app-capable`, status-bar-style `black-translucent`, an app title,
  `color-scheme`, a description, `apple-touch-icon` and manifest links, and a PNG icon. The intro scripts are
  unchanged; the gamepad engineer's pad-skip poll is kept.
- `public/manifest.webmanifest`: name RECURSION, `display: fullscreen` (with a `display_override` to standalone),
  `orientation: landscape`, theme and background `#05080d`, relative `start_url` / `scope` of `./`.
- `public/icons/`: `icon.svg` (the ring motif) plus PNGs rendered from it: `apple-touch-icon.png` (180),
  `icon-192.png`, `icon-512.png` and `icon-maskable-512.png`. They are generated by `node src/ui/preview/gen-icons.mjs`,
  which renders the SVG with the preinstalled Chromium; no new dependency.
- Main menu on iOS Safari when not running standalone: a dismissible "Play full screen — Tap [share] then Add to Home
  Screen" card at the bottom left.

## Shared-file edits (minimal, additive)
- `src/engine/input/InputSampler.ts`: the `touch` source (described above).
- `src/app/bootstrap.ts`: the `wireTouch` import, a `wireTouch({...})` block after `wireGamepad`, and
  `touch.dispose()`.
- `src/ui/createUI.ts`:
  - the touch layer is mounted under the HUD layer, the rotate overlay on top;
  - a `refreshTouch()` call on every screen, device or timeline change and on every HUD frame;
  - `UIHandle.touch` (`TouchUI`) and `CreateUIOptions.touchEnv`;
  - the home-screen hint in `showMainMenu`;
  - `data-input` can now be `touch`.
- `src/ui/glyphs.ts`: the touch device kind and touch caps.
- `src/ui/hud/Hud.ts`: a one-line change so the onboarding "move" card shows the joystick glyph for any non-keyboard
  device.
- `src/ui/timeline/TimelinePanel.ts`: `touchMode`, the tap-to-open strip, the hint and the grab handle.
- `src/ui/menus/Overlays.ts`: the pause "Restart chamber" button uses hold-to-confirm on touch.
- `index.html`: meta and link tags only.

## Tests
- `src/ui/touch/touch.test.ts` has 30 unit tests:
  - joystick quantization: deadzone, the 8 sectors, -1/0/1 at every angle and distance, the base following the thumb,
    hysteresis;
  - gestures: stick, ignored second finger, pinch sign, two-finger tap, no tap when slow or cancelled;
  - visibility rules, including portrait and the orientation pause;
  - iOS and touch-first detection, and the Add to Home Screen rule;
  - InputSampler touch parity with the keyboard and its priority;
  - touch glyphs;
  - the DOM layer: touch mode at start, hiding for keyboard or pad and returning on touch, multi-touch stick plus
    Interact, every button's command, release on hide, the rotate overlay, the strip opening the sheet, the pause hold
    gate, the home-screen hint and its dismissal, and no behaviour change on desktop.
- `tests/e2e/mobile.spec.ts` uses iPhone 15 emulation at 852×393 with real multi-touch through CDP
  `Input.dispatchTouchEvent`. The flow:
  1. Boot: touch mode, viewport-fit, apple meta, the manifest and every icon served, the home-screen hint.
  2. Tap Begin, then tap the intro's Begin.
  3. Joystick drag moves the player while a second finger taps Interact. The recording holds only -1/0/1, exactly one
     latched interact press, and idle input after release.
  4. New echo.
  5. Tap the strip to open the sheet; a drag scrubs to about 55%.
  6. Collapse, then the pause button.
  7. Hold to restart.
  8. Portrait shows the overlay and the game pauses; back to landscape.

  **Passed:** `CI=1 E2E_PORT=4611 npx playwright test tests/e2e/mobile.spec.ts` (2.3 min). The rest of the e2e suite
  was not run, as instructed.
- `npm run verify` at the end: typecheck clean · Vitest **37 files, 533 tests passed** · build OK. The golden replays
  pass unchanged.
- Layout was iterated over 3 rounds of screenshots, all in the scratchpad:
  - UI preview at 852×393 and 734×343 (Safari with its toolbars): HUD, timeline sheet, menu, levels, settings, pause,
    intro, complete, onboarding;
  - the real app's HUD, timeline sheet, menu and portrait overlay from the e2e run.
- Fixes found by iterating:
  - a root class (`rx-tpause`) collided with the pause button's class;
  - with the label column hidden, the strip's lanes collapsed to zero width;
  - the hint card overlapped the level card;
  - echo names in the sheet were cut off;
  - the menu logo rows spread apart;
  - the strip header wrapped at 734 px wide.

## Known limits / notes for the director
- Not run on a real iPhone or in WebKit, only Chromium emulation. Worth checking on a device: safe-area padding next
  to the Dynamic Island, `black-translucent` status bar overlap in the home-screen app, audio unlocking on the first
  tap, and that pinch never zooms the page.
- That a short tap does **not** restart from the pause menu is covered by a unit test only. Under software WebGL a
  single frame can outlast the 0.75 s hold, so the e2e spec checks the hold path alone.
- Level hint texts are authored content and still say "Press E…". Tutorial cards and prompts do switch to touch names.
- The Space context action has no touch button: no level's solution and no entity uses it.
- The two-finger overview is camera-only. It ends when the controls hide (pause, timeline) and the follow camera
  comes back when they return.
- The hint card can sit over the left thumb area on very short screens (343 px tall). It is narrower there and can be
  collapsed with its X.
- The vite dev server I started was stopped by PID; Playwright shut down its own preview server.
