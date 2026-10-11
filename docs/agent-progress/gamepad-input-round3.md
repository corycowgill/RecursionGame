# Gamepad input engineer: round 3

Owner: `src/engine/input/**`, gamepad/focus navigation in `src/ui/**`. Nothing is committed; the director handles git.

## Summary

The game can now be played start to finish with a controller using the standard Gamepad API mapping (Xbox,
PlayStation, Switch Pro over USB/Bluetooth, and Safari on iOS). A controller produces exactly the `PlayerInput` /
`GameCommand` stream a keyboard produces. Stick and D-pad input is quantized to -1/0/1 before it reaches the
existing `InputSampler`. Interact presses are latched there, the same as keys. The simulation, contracts and golden
replays are untouched.

## What was built

**Input layer (`src/engine/input/`)**
- `gamepadMapping.ts` (pure): standard button indices, `quantizeStick` (radial deadzone 0.35 with hysteresis, snapped
  to 8 directions, output only -1/0/1), D-pad and dominant-direction helpers, `HoldTracker` (hold to confirm, fires once),
  `RepeatTimer` (menu auto-repeat that speeds up while held), `padStyleFromId` (xbox / playstation / nintendo from
  `Gamepad.id` vendor ids and names), and button labels and names per controller family.
- `gamepadBindings.ts` (pure): remappable actions (interact, action, rewind, restart, timeline, preview, echoPrev,
  echoNext), defaults, `sanitizePadBindings`, `assignPadButton` (reports the action that lost the button). Some
  controls are fixed so nobody can lock themselves out: the left stick and D-pad move/navigate, Menu/Start pauses, A
  confirms and B goes back in menus, and Home stays with the OS.
- `GamepadInput.ts`: polls `navigator.getGamepads()` once per frame and merges every connected pad. In
  **gameplay** mode it drives the sampler (`setPadMove`, `setInteract(…,'pad')`, `pressAction`) and emits GameCommands:
  Y = rewind, hold X 0.6 s = restart, View = timeline, Menu = pause, LT = temporal preview (held). It also emits
  PadEvents: LB/RB cycle the echo selection, the right stick zooms, and the hold-to-restart fill. In **ui** mode it
  emits navigation (with auto-repeat and acceleration) and button presses. Hot-plug is detected by polling and by the
  connect/disconnect events. Two guards stop a press from doing double duty: a button held through a mode change must
  be released before it acts again (a menu confirm never becomes an interact), and so must a button already held when
  a pad appears (the press that skipped the studio ident or woke a Bluetooth pad).
- `InputSampler.ts` (additive): there are now keyboard and pad sources. A held key direction wins, otherwise the
  pad's direction is used. Both go through the same camera-yaw rotation. Interact is held while either source holds
  it, and each source latches its own presses. The existing API and behaviour are unchanged (all prior tests pass).

**UI (`src/ui/`)**
- `glyphs.ts`: prompts follow the device used last: keyboard key caps, Xbox A/B/X/Y (coloured round caps),
  PlayStation ✕○□△, or Switch letters by position. This covers HUD control hints, tutorial cards (`{key:…}` text and
  key rows), the interaction prompt, the timeline header and tooltips, the hold indicator, and screens built once
  (the main menu footer and the intro "to begin" line, switched by CSS through `data-input` on the UI root).
- `padNav.ts`: spatial D-pad/stick focus navigation over whichever screen is on top. Focus moves to the nearest
  control in the pressed direction, so grids, tab rows and two-column layouts all work. Range sliders step with
  left/right, A clicks, and B calls `ui.back()`. While a controller is the active device a visible gold focus ring is
  shown (`.rx-pad`). No synthetic keyboard events are sent, so the keyboard layer and key-rebind capture never see pad
  input. It falls back to DOM order when there is no layout (unit tests).
- Timeline (`TimelinePanel.padInput`): left/right scrub (15 → 30 → 90 ticks per step while held, on top of the
  auto-repeat speed-up). Up/down select a track (player, echo 1, echo 2 …). A hides or shows the selected echo, or
  play/pauses on the player track. X deletes the selected echo, RB cycles the zoom, and B returns to live, then
  collapses the timeline. A controller legend appears under the transport bar.
- Settings → Controls → **Gamepad** section (`menus/PadRemap.ts`): one row per action. Pick a row and press a button.
  Menu/Esc or a 6 s timeout cancels, reserved buttons are refused, and the notice names any action that lost its
  button. There is a "Restore default buttons" button and a connected-controller status line. The bindings are
  persisted in the save next to the keybinds.
- Hold-to-restart indicator: a coral ring around the restart glyph, labelled "Restarting chamber" (`setRestartHold`).
- Hot-plug toasts ("Xbox-style / PlayStation / Switch Pro controller connected", "Controller disconnected · game
  paused").

**App (`src/app/gamepad.ts`, plus about 15 lines in `bootstrap.ts`)**: `wireGamepad()` feeds the keyboard's sampler and
command handler, routes ui-mode events to `ui.padInput`, and sends right-stick zoom as wheel-equivalent deltas to the
element the camera already listens on, so camera sensitivity applies and no renderer change was needed. A disconnect
during play pauses the game. Keyboard or mouse input switches the prompts back to key caps; touch is left to the touch
layer.

**Studio ident (`index.html` inline script)**: while the ident plays, a rAF loop polls the gamepads and turns any
button press into a `keydown`, which the vendored script already treats as a skip. `public/intro/hallucinated-intro.js`
is unchanged, and it is still skipped under `navigator.webdriver`.

## Shared-file edits (minimal, additive)
- `src/persistence/save.ts`: added `SaveData.padbinds` (defaults for older saves, sanitized on load),
  `SaveStore.setPadBindings()`, and `reset()` keeps padbinds like it keeps keybinds.
- `src/app/bootstrap.ts`: import, `onPadBindsChange` callback, `padbinds` / `padsConnected` passed to `createUI`, the
  `wireGamepad({...})` block after `keyboard.attach`, `gamepad.poll(dtMs)` in the frame loop, and `gamepad.dispose()`.
- `src/ui/types.ts`: optional `UICallbacks.onPadBindsChange`. `src/ui/index.ts`: `export * from './glyphs'`.
  `src/ui/ui.test.ts`: the mock list gained `onPadBindsChange`.
- `src/ui/menus/Settings.ts`: `SettingsOptions.pad`, the Gamepad section appended to the Controls tab, and
  `padButton` / `padCapturing` on the returned screen. A concurrent agent's quality-preset edits in this file were
  left intact.
- `src/ui/hud/Hud.ts`, `TimelinePanel.ts`, `createUI.ts`, `MainMenu.ts`, `Overlays.ts`: device-aware glyphs and pad
  routing as described above. Keyboard output is unchanged.
- `index.html`: gamepad skip for the ident (inline script only).
- Styles are injected from `padNav.ts` (`#rx-pad-styles`). `styles.ts` was not touched.

## Tests
- `src/engine/input/gamepad.test.ts` (20): deadzone and 8-way quantization (every angle gives only -1/0/1),
  hysteresis, hold-to-restart (fires once, resets), auto-repeat, sampler latching for pad and combined keyboard+pad
  input, camera rotation, hot-plug and family detection, commands, ui-mode navigation, the release guard on mode
  change and on connect, disconnect releasing held state, binding assign/sanitize, and **binding persistence** through
  `SaveStore` (round-trip, survives a progress reset, old-save migration).
- `src/ui/pad.test.ts` (7): glyphs for each controller family, HUD/tutorial switching, D-pad menu navigation and
  A/B, Settings remap by controller, timeline pad control, the hold indicator, and spatial picking.
- `tests/e2e/gamepad.spec.ts` (mocked pad through `addInitScript`): hot-plug toast and glyphs → D-pad menu focus →
  A starts L1 and dismisses the intro → the left stick moves (the recording holds only -1/0/1) → A interact is latched
  → Y creates an echo → View opens the timeline, D-pad scrubs, View closes it → Menu pauses, B resumes → holding X
  restarts → unplugging pauses. **Passed** (`CI=1 E2E_PORT=4517 npx playwright test tests/e2e/gamepad.spec.ts`,
  1.4 min). The rest of the e2e suite was not run, as instructed.
- `npm run verify` at the end: typecheck clean · Vitest **36 files, 503 tests passed** · build OK. The golden replays
  pass unchanged.
- Screenshots (scratchpad only): Xbox and PlayStation HUD hints, the focus ring on the menu, the Settings Gamepad
  section, the timeline legend, the hold ring, and iPhone 15 emulation (hint row wraps).

## Known limits / notes for the director
- The Gamepad API has no button events, so a press that starts and ends between two animation frames (under 16 ms at
  60 fps) can be missed. Anything seen in a frame is latched to the next tick.
- Triggers: LT is the temporal preview, so camera zoom is on the right stick only. RT is unbound by default and can be
  bound to any action.
- On iPhone emulation the HUD panels overlap at phone width. That is the touch/mobile layout's area, not caused by the
  pad work. My hint row now wraps when a controller is active.
- Safari (iOS/macOS) reports a pad only after its first button press; the connect toast appears then.
- Untested on real hardware (only Chromium with a mocked pad). The trigger threshold (0.5) and deadzone (0.35) are
  constants in `gamepadMapping.ts`.
