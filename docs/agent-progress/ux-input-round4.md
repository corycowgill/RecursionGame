# UX & input engineer — round 4 report

Date: 2026-10-11 · Branch `claude/recursion-game` (not committed; the director handles git)
Ownership: `src/ui/**`, `src/engine/input/**`, `src/app/**` (input/touch wiring), and hint/tutorial text in `src/levels/**`.

The simulation is unchanged. Every per-tick hash, checkpoint, digest and event count in `src/testing/replays` is
identical. **One golden caveat:** `levelFingerprint` (in `golden.ts`) hashes the whole level JSON, hint text included.
Editing the hint text of L01, L03, L07, L10 and the test chamber therefore made the replay test report "level
definition changed". I updated only those five `levelFingerprint` numbers in their `.golden.json` files and in
`fuzz-fingerprints.golden.json`. That is 9 lines, all `levelFingerprint`, with no hash changes; check with
`git diff src/testing/replays | grep '^[-+] ' | grep -v levelFingerprint`, which prints nothing. I did not run
`replays:update`, so nothing else in the working tree was baked in.

Suggestion for QA: exclude presentation-only fields (`name`, `subtitle`, `story`, `hints`, `decor`) from
`levelFingerprint`, so copy edits stop invalidating goldens.

## What changed

### 1. Device-aware hints and story text (closes v0.3 known issue 3)
- New `src/ui/actionText.ts`. Authored text names an action with a token, and the token is drawn through the existing
  glyphs module for the device used last:
  `{interact}` `{action}` `{echo}` (alias `{rewind}`) `{restart}` `{timeline}` `{preview}` `{pause}` `{move}`.
  The onboarding cards' older `{key:<action>}` form still works. A token renders as one of:
  - a key cap that uses the player's own (remapped) binding,
  - an Xbox / PlayStation / Switch glyph that follows remapped pad buttons,
  - the on-screen touch button name and icon.

  `actionTextPlain` gives the text form for aria labels.
- Converted text (text only; no layout, entity or solution changes):
  - L01 "Press {echo} to rewind…"
  - L03 "Press {interact} facing the crate … {interact} again…"
  - L07 "…pressing {interact} every second…"
  - L10 "…press {interact} — your echo…"
  - test chamber "press {echo} to rewind"

  No other level text (names, subtitles, story, entity labels/config) named a key.
- Where the tokens are rendered:
  - HUD hint card. It is re-rendered on every device or binding change: Hud keeps the hint state, and `refreshHint()` is called from `applyGlyphs`.
  - Pause-menu hint list (`createPause` takes an optional `html` renderer).
  - Level intro story and subtitle (`createLevelIntro` takes an optional text renderer).
  - Onboarding cards (now use the same renderer).
- In touch prompts, the `action` glyph is now labelled **Action** with a bolt icon. It used to read "Interact".
- **Lint test:** `src/ui/actionText.test.ts` fails if any campaign or test-chamber text contains a raw key or an
  unknown token. It checks the name, subtitle, story, hints, entity labels and every config string. It also checks the onboarding titles and texts.
  - It catches: "Press E", "pressing E", "hold Q", "R to rewind", "E again", "Shift+R", "Space", "Tab", "Esc", "WASD" and "arrow keys".
  - It does not flag ordinary prose ("hold the Hall Plate", "Laser A, Receiver A…").

### 2. Touch Action button (closes known issue 4)
- New `Action` button (`data-testid="touch-action"`, green, bolt icon) in the free slot left of Timeline, above New echo.
  The right-hand cluster keeps its size.
- It shows only when relevant (`src/ui/touch/actionButton.ts`):
  - while the faced entity's behaviour implements `action` and the prompt is actionable, not blocked. This is derived from `CORE_BEHAVIOURS`, so today it means timed switches;
  - or for a whole chamber whose verified solution contains an `action` step, or whose `teaches` includes `'action'`.

  No level does this today.
- While hidden, the button ignores pointer and keyboard activation and is `aria-hidden`. If it hides while a finger
  holds it, it is released.
- Wiring: `TouchSink.action?()` (optional, additive) → `src/app/touch.ts` → `sampler.pressAction()`, gated by
  `gameplayActive()`. This is the same latched press as Space and the pad button, so recordings are identical across devices.

### 3. Short phone screens: hint chip (closes known issue 5)
- At ≤ 360 CSS px tall in touch mode, a new hint arrives **collapsed** as a small "Hint 2 / 3 · Tap" chip.
  - The chip sits right under the level card. A `ResizeObserver` in the HUD measures the card's bottom edge into `--rx-lvl-b`.
  - It pulses three times when new.
  - Tap expands it in the top band, over the level card and the same width. Its max height keeps it above the joystick's rest position.
  - The × button, or a finger starting the joystick (`TouchControls.onStickStart`), folds it back to the chip.
- Taller screens keep the previous behaviour, and so does the desktop.
- Also: the Interact button's prompt tag ("ACTIVATE SWITCH") is now right-anchored. It used to run off the right edge on
  phones.

### 4. Keyboard rebind oddity (closes known issue 7)
In Settings → Controls, while a keyboard rebind waits for a key:
- Clicking any row cancels the pending rebind and starts nothing. This includes the same row, a mouse click, a touch, or pad A activating a row.
- Any controller button cancels it and is consumed. This means A cannot start another rebind, and B cancels instead of closing Settings.
- Focus stays on the row the player is on.
- The notice reads "Rebinding cancelled", the same as Esc.
- A pending **pad** rebind still takes priority for pad buttons.

## Shared-file edits (minimal, additive)
- `README.md`, Touch section: added the Action button row and replaced the "no touch button for Space" sentence. Added one
  sentence on device-aware hints and the short-screen chip.
- `src/testing/replays/*.golden.json`: the `levelFingerprint` values only (see the caveat above).
- `docs/architecture/contracts.md` §11: one bullet saying player-facing level text uses action tokens.
- `tests/e2e/mobile.spec.ts`: imports `CAMPAIGN_LEVELS` and `compileSolution` from `src` on the Node side, to steer the player to
  L05's Drive Switch.

## Tests

Unit tests:
- `src/ui/actionText.test.ts` (9 tests): lint self-test, all levels and onboarding clean, rendering per device including remapped keys
  and pad buttons, escaping and unknown tokens.
- `src/ui/inputUx.test.ts` (10 tests):
  - Action relevance rules, and the DOM button (hidden, shown for a switch, tap → one `action()`, hidden when blocked);
  - the hint card re-rendering on device change and the pause hint list;
  - the short-screen chip (collapsed → tap expands → joystick folds), and no auto-collapse on tall screens;
  - three rebind-cancel cases (click another row, click the same row, pad A or B).

e2e:
- `tests/e2e/mobile.spec.ts`:
  - Existing test: the Action button is hidden on L01 at the start.
  - New test "short phone screen (740×340)":
    1. Pause, reveal 2 hints: the list shows "New echo", not "Press R".
    2. The chip is clear of the joystick ghost and the level card, and under 44 px tall.
    3. Tap expands the card, still above the joystick; a joystick drag collapses it.
    4. On L05, the player is stepped to the Drive Switch: the Action button appears.
    5. Tapping Action records exactly one `actionPressed` and a successful `action` marker on the switch.
- `tests/e2e/gamepad.spec.ts`:
  1. In the pause menu, revealed hints show the **Y** glyph.
  2. Settings → Controls: pad A on a keyboard row starts a rebind; pad A on another row cancels it ("Rebinding cancelled", E unchanged); B goes back to pause.
  3. After resuming, the HUD hint card shows Y. A Shift key press switches it to the **R** key cap, and LB switches it back to Y.

Results: see "Runs" below.

## Runs
- `npm run verify` at the end: typecheck clean · Vitest **42 files, 575 tests passed** · build OK. This includes `replays.test.ts`
  (24/24) after the fingerprint-only update.
- Targeted Vitest during the work: `src/ui src/app src/levels src/engine/input`, all green.
- Playwright: Chromium/SwiftShader, my own build in the scratchpad served on port 4791 (killed by PID afterwards). Run:
  `E2E_PORT=4791 npx playwright test tests/e2e/mobile.spec.ts tests/e2e/gamepad.spec.ts`. Result: **3 passed** (8.8 min).
  - gamepad: 3.0 min
  - iPhone end to end: 3.4 min
  - short phone (740×340): 2.4 min
- Iteration screenshots are in the scratchpad only. Nothing was written to `docs/`.

## Notes / known limits
- The Action button's relevance is a prediction (`predictInteraction`), like the Interact highlight. It can be wrong only in
  same-tick contests.
- Facing a timed switch, Interact and Action both activate it (the engine's switch behaviour answers both). The Action
  button appears there because the faced entity uses `action`, as specified.
- The chip mode keys off `matchMedia('(max-height: 360px)')` when a hint arrives. Rotating or resizing while a hint is open
  restyles it (the CSS is media-queried) but does not change whether it is collapsed.
- Real touch hardware and real controllers remain untested (Chromium emulation only).
