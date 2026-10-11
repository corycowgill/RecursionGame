# Game Director: round 3 verification (controllers and iPhone)

Scope: integrate and verify the three round-3 teams (gamepad input, touch / mobile UX, mobile performance), then
update the README and release notes. Nothing is committed; the director handles git separately.

All browser checks ran in **Chromium only** (SwiftShader software WebGL). iPhone = Playwright `devices['iPhone 15']`
in landscape 852×393 (touch, isMobile, DPR 3) with iPhone 15 landscape safe-area insets (left/right 59 px, bottom
21 px) injected through CDP `Emulation.setSafeAreaInsetsOverride`. Controllers = `navigator.getGamepads` overridden
in `addInitScript` plus a dispatched `gamepadconnected`. **Real Safari/WebKit, touch hardware and controllers were not
tested.**

## Results

| Gate | Result |
|---|---|
| `npm run verify` (start and end) | Green: typecheck clean, Vitest 37 files / 533 tests passed, none skipped, build OK |
| Golden replays | Unchanged (no file changes under `src/testing/replays`); the simulation was not touched |
| Targeted e2e (gamepad, mobile, smoke, flows) | 9/10. Smoke flow timed out at 240 s while competing for CPU with my scripts; re-run alone passed in 3.9 min |
| Full e2e suite (`CI=1 E2E_PORT=4713 npx playwright test`) | **17/17 passed** in 26.9 min; no visual baselines re-blessed |
| Perf probe (SwiftShader) | L10 high 376 draw calls / 0.43 fps, low 253 / 0.48 fps: same as v0.2 |

## Cross-device checks (scratchpad script `xdevice.cjs`)

- **Desktop keyboard (12/12):** UI root is `data-input="keyboard"`, no touch classes, no touch controls, rotate
  overlay or Add-to-Home-Screen hint; WASD moves, recording only -1/0/1, R makes an echo, Tab expands the timeline,
  Esc pauses; HUD hints show key caps; no console errors or warnings.
- **Mocked Xbox pad + keyboard (8/9):** the stick switches prompts to Xbox glyphs, a key switches them back; one
  recording holds stick, D-pad and WASD input, all -1/0/1; Y makes an echo; Menu pauses and keyboard Esc resumes; no
  console errors. The one miss was my script's assumption: the HUD switches to pad glyphs as soon as the pad
  connects, so my "before" sample already showed pad glyphs. Not a product bug.
- **iPhone 15 landscape (9/10):** touch mode at boot; touch buttons, HUD cards and the timeline strip are inside the
  safe-area insets; a key press hides the touch controls and a tap brings them back; the Timeline button opens the
  sheet; portrait shows the rotate overlay and landscape hides it; no console errors. The one miss was my menu check
  catching the decorative ring graphic, which is drawn past the left edge on purpose. Every menu button and text block
  is inside the insets (verified in the screenshot).
- **All 10 levels under iPhone emulation (11/11):** L01–L10 complete via `runSolution`, no page errors.
- **Settings at phone width:** the 6-button quality row (Auto, Low, Mobile, Medium, High, Ultra) fits at 852×393, and
  every button is inside the insets.
- **Intro skip by controller:** `index.html`'s inline script polls the pads during the ident and sends a `keydown`,
  which the vendored script (unchanged) handles as a skip; it is still skipped under `navigator.webdriver`. I read the
  code but could not exercise it in automation, because the ident never plays under webdriver.

## Screenshots

These four files are new in `docs/art-direction/screenshots/` (nothing else was added). I read each one and found no
layout problems that needed fixing:
- `final-mobile-menu.png`: iPhone landscape menu, logo beside the list, Add to Home Screen hint, inside the safe area.
- `final-mobile-hud.png`: L05 mid-solve with two echoes; compact HUD cards, joystick, the four action buttons, pause
  button and timeline strip, with no overlaps.
- `final-mobile-timeline.png`: the touch timeline bottom sheet with player + 2 echo lanes and per-echo
  select/hide/delete.
- `final-gamepad-prompts.png`: desktop with a mocked Xbox pad; tutorial card shows the L-stick glyph, and the HUD hint
  row shows A/Y/X/View/LT/Menu.

## Edits made by the director

- `tests/e2e/smoke.spec.ts`: describe timeout raised from 240 s to 360 s, with a comment. The full smoke flow takes
  3.6–3.9 min under SwiftShader on an idle machine, right at the old budget.
- `README.md`: the tagline covers controllers and iPhone; separate controls tables for keyboard, game controller and
  touch; a new "Playing on iPhone" section (Share → Add to Home Screen; HTTPS is required for iOS home-screen apps and
  the Gamepad API, and the Render blueprint serves HTTPS); a note that hardware was not tested; `?quality=auto|mobile`;
  the manifest and icons; e2e suite and architecture lines.
- `docs/agent-progress/release-notes.md`: a new v0.3 section at the top (summary, cross-device check table, a hardware
  checklist for the owner, known issues, the tests actually run). The v0.2 notes are kept below it.
- `docs/art-direction/screenshots/`: the four screenshots above.
- No source changes were needed: I found no integration defects.

## Notes

- Preview servers I started (port 4720) were killed by PID. Playwright stopped its own servers (4711, 4712, 4713).
  Two other `vite preview` processes were still running and are not mine: port 4399 (started at 00:03) and port 4518
  (PID 25629; the gamepad agent's screenshot port, which its report said was stopped). I left them alone.
- Iteration screenshots and scripts are in the scratchpad (`xdev/`, `finals/`, `xdevice.cjs`, `finals.cjs`,
  `settings.cjs`).
