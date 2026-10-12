# RECURSION — Release Notes (v0.5, round 5: story and ending, chamber moods, solver-checked difficulty)

Date: 2026-10-12 (v0.4 and earlier: below) · Build: `npm run build` → static `dist/` + `dist/sw.js` · Reviewer: Game Director

Same honesty rule as before: "verified" means checked by a test that was run for this release. **Every v0.5 browser
check ran in Chromium only** (SwiftShader software WebGL, ~0.3–0.5 fps). iPhone was emulated, controllers were mocked.
**Nobody has playtested this build.** Every playtime, par time and hint delay below comes from a model.

## v0.5 summary

- **Story, ending and credits.** Every chamber's intro card has a location line, a narration line and a log entry
  signed "H.A."; the logs build to a reveal at the Core (`docs/game-design/story.md`). The first clear of L10 plays an
  ending (camera pull-back, the echoes walk into the player, three lines, fade to white) and then the credits roll and
  return to the main menu. Any fresh key, click, tap or controller button skips it. After finishing the campaign, level
  select offers **Ending** and **Credits**. The main menu's **Credits** screen replaces the old placeholder
  ("HALLUCINATED GAMES presents", the team, three.js / Orbitron / Rajdhani licences).
- **Share card:** `public/og-image.jpg` (1200×630, a real L10 frame) and Open Graph / Twitter tags. `VITE_SITE_URL`
  must be set to the Render origin before crawlers can load the image (see README).
- **Chamber moods and wear:** each chamber gets its own lighting mood within five wings (Dawn Atrium, Chronometry Lab,
  Machine Hall, Paradox Wing, Core), plus per-wing material variants (oxidised brass to chrome-gold) driven by uniforms
  only, with no new draw calls.
- **Shader warm-up:** echo-hologram and ghost-path programs are compiled at level load, so the first echo no longer
  freezes the game (measured below).
- **Character:** the turntable head tilt (rotation order) and the idle head roll were fixed; face and hair polished.
- **Puzzle solver and difficulty report:** `npm run solve` searches the real simulation for solutions, fewer-echo
  routes and shortcuts. Three shortcuts were found and closed with one extra wire each (L02 1-echo, L06 2-echo,
  L10 2-echo); the intended solutions finish on the same tick as before. Par times and hint delays now come from a
  documented difficulty model (`docs/game-design/difficulty-report.md`).
- Main-menu footer now reads `v0.5` (it still said "v0.1 · vertical slice").

## Estimated playtime and levels to playtest

From the difficulty model, **not** from players: **31–134 min for the campaign, median ≈ 61 min**, against the
60–120 min target (the median is at the low edge). L10 alone is about 27 % of it (median 17 min, high estimate 37 min).

Flagged for the first playtest (difficulty report, section 7):

| Level | Why |
|---|---|
| **L05** Perfect Timing | **Can be solved with one echo** (designed for two); solver-verified, completes at 9.42 s. Left open on purpose: no layout-only fix exists because the island door has no deadline. **Product-owner decision needed** between the three options in difficulty report §3.1 (remove the island, also wire the Drive Switch to the door, or keep it and offer 1 echo as an optional challenge). Current behaviour is pinned by a campaign test. |
| L06 Chain Reaction | Tightest window in the first half (3.6 s). |
| L07, L09 | Blind recording is priced as a flat 120 s "insight" in the model; real players may differ a lot. |
| L08 Recursive Machine | Cheapest late chamber in the model; does the nested-loop idea land without the third hint? |
| L10 The Core | About 27 % of the campaign; four timing constraints (tightest 2.7 s); first hint at 100 s. |
| Whole campaign | Time real sessions per chamber to recalibrate the model. |

Solver evidence: fewer-echo searches are exhaustive within stated bounds for every level except where noted as
budget-limited (L03 wide 1-echo, L06 wide 2-echo, L07/L09 wide 1-echo, L10 2-echo); those found nothing in their time
budget but are not proofs.

## v0.5 director checks (Chromium)

| Check | Result |
|---|---|
| `npm run verify` | **Pass** at the start and end of the pass: typecheck clean, Vitest 48 files / 636 tests, none skipped (no `.skip` / `.only` / `.todo` in `src` or `tests`), build OK |
| Golden replays | **Pass, justified diffs.** (1) Uncommitted at the start of the pass: only the 20 `levelFingerprint` lines changed (10 level goldens + 10 lines in `fuzz-fingerprints`), because every level's intro `story` text changed; the level-definition diffs are only `story` lines; every per-tick hash, checkpoint and completion tick is identical. (2) Committed earlier this round: L10's per-tick hashes changed because of the new socket→gate inverted wire (a real layout change; the gate's state is hashed); completion tick unchanged (1063). L02, L06 and L05 changed only fingerprints (wires to existing entities, par/hint changes). Accepted. |
| Full e2e suite (`CI=1 E2E_PORT=4401 npx playwright test`) | **22 passed, 0 failed** in 30.1 min (4 new credits/ending tests). All visual baselines matched: **no re-bless**. The 3D baselines use L03 (Chronometry Lab mood) and default-mood scenes; the L03 mood change stays inside the 5 % / 0.3 tolerance. |
| Main-menu UI visual test after the director's `v0.5` label change | **Pass** (1.6 min), within the 2 % tolerance; baseline not re-blessed (it still shows the old footer text) |
| Ending path, real app, L10 completed through the debug hook (fresh save, high quality) | **Pass** for keyboard, mocked Xbox controller and iPhone-emulated touch: first clear starts the ending; one key / A button / tap skips it; credits roll (studio header, Cory Cowgill, licences); Esc / B / tap on "Main menu" returns to the menu; L10 saved as completed; the simulation hash is unchanged by the ending; **0 console errors or warnings** in all four runs |
| Ending left to play out (no input) | **Pass**: ending → credits → menu on its own. At SwiftShader frame rates it took 126 s of wall time (the ~14.6 s sequence is driven by frame time, which is clamped at ~0.3 fps); the skips above were sent 10–24 s in, so they were real skips |
| Perf probe (L10, SwiftShader) | high 0.35 fps / 377 draw calls / 0.77 M triangles; low 0.41 fps / 253 / 0.61 M (v0.4: 376 / 255). Unchanged within noise |

**First-echo hitch** (L01, record 1 s, press R; long tasks after the commit; 3 runs per cell; "before" = this tree with
`prewarm()` disabled, "after" = this tree; idle machine, `vite preview`):

| Quality | Before: hitch per run (median) | After | Level load, before → after (median) |
|---|---|---|---|
| high | 11.5, 8.8, 11.5 s (**11.5 s**) | **none in 3/3** (frame gaps stay at the normal ~3 s) | 10.9 s → 18.1 s |
| low | 7.2, 7.3, 7.2 s (**7.2 s**) | **none in 3/3** | 8.5 s → 16.2 s |

So the freeze when the first echo appears is gone, and the cost moved into the level load (+7 to +8 s here, behind the
intro fly-in and the level card). On a real GPU with parallel shader compile it should overlap the intro: unmeasured.

**Main menu** (`?quality=low`, fresh browser per run, before/after alternated, 4 runs each). The menu DOM exists at
~1.3–2.0 s, behind the studio intro; app mode becomes `menu` at ~4.1 s in both builds. Then the first 3D frames
of the attract replay stall the page:

| Build | Frame stall after the menu appears (median) | Menu steady (first regular frame, median) |
|---|---|---|
| before (no warm-up) | 10.2 s (10.4, 10.0, 10.1, 10.7) | **14.6 s** |
| after | 6.4 s (6.2, 6.9, 6.4, 6.4) | **10.7 s** |

The round-4 "~4 s menu stall" is smaller: the menu is steady about 4 s sooner on this machine. Cause not profiled (the
warm-up compiles the same programs in one batch at `setLevel` instead of across several first frames). In 3 of 8 runs
(both builds) a later 4.6–6.6 s frame stall happened 20–37 s in, while the attract replay was running. Long-task
counts alone understate the stall (most of it is GPU-process time), so these numbers are frame gaps.

**Screenshots** (overwritten or new, `docs/art-direction/screenshots/`): `final-L01…L10-midsolve.png` (real app, high
quality, solution paused mid-run), `final-character.png` (turntable, front three-quarter), new `final-ending.png`
(the ending's three lines over the Core overview) and `final-credits.png`. Compared with the concept sheet: the five
moods read as intended (warm Dawn in L01–L02, cool Lab in L03–L04, violet Paradox in L07–L09); no regressions found.
In L07 the player stands behind the gate arch at that tick (same framing as the v0.4 shot). The character's head is
still small for the shoulders and the hair reads blocky next to the concept: known, needs an art pass.

## Check on real hardware (owner), new in v0.5

Everything in the v0.4 list below still applies. In addition:

1. **Playtest the campaign** and time each chamber; decide on **L05** (above).
2. Ending pacing at real frame rates (~14.6 s), whether the reveal lands, and whether the intro log lines read as
   mystery or clutter.
3. Level load time on a real GPU now that shaders are compiled at load, and whether the intro hides it.
4. Set `VITE_SITE_URL` in Render, then check the share card in Facebook / X / Slack.
5. Art sign-off on the five moods (especially the Machine Hall and Paradox floors) and a colour-blind check of the
   violet Paradox accents next to Echo 3's colour.

## v0.5 known issues

1. **L05 can be solved with one echo** (product-owner decision, above).
2. Playtime, par times and hint delays are model output only.
3. `og-image.jpg` (90 KB) is precached by the service worker; excluding it needs a change in
   `src/build/precacheManifest.ts`.
4. Echoes vanish abruptly when they reach the player in the ending (no dissolve effect yet); at share-card size the
   characters are tiny.
5. Character hair/sculpt pass outstanding; the main-menu UI visual test is slow (1.4–4.6 min) and can time out under
   heavy machine load.
6. `graphics-preview.html` has no favicon link, so the dev page logs one 404 for `/favicon.ico` (dev tool only).
7. Still open from v0.4: real Safari/WebKit, touch hardware, controllers, GPUs and speakers untested; critical-path JS
   unchanged; short gamepad presses can be missed.

## v0.5 tests run (director)

- `npm run verify` at the start and end of the pass (48 files / 636 tests, none skipped, build OK).
- Full Playwright suite once: 22 passed in 30.1 min, no re-bless. Main-menu UI visual test re-run after the label
  change: passed.
- Director scripts in the scratchpad (not committed): ending play-through ×4 (keyboard, pad, touch, no input),
  mid-solve and turntable captures, first-echo long-task trace (12 runs), main-menu frame-gap trace (8 runs + 3
  long-task-only runs).

Team reports: `docs/agent-progress/puzzle-analyst-round5.md`, `art-rendering-round5.md`,
`narrative-release-round5.md`; director: `docs/agent-progress/director-round5.md`.

---

# v0.4 (round 4: device-aware hints, feedback, offline play)

Date: 2026-10-11 (v0.3, v0.2 and v0.1: below) · Build: `npm run build` → static `dist/` (relative base path) + `dist/sw.js` · Reviewer: Game Director

Same honesty rule as before: "verified" means checked by a test that was run for this release. **Every v0.4 browser
check ran in Chromium only** (SwiftShader software WebGL, ~0.5 fps). iPhone was emulated (`devices['iPhone 15']`),
controllers were mocked. Real Safari/WebKit, real touch screens, real controllers, real GPUs and real speakers were
**not** tested.

## v0.4 summary

- **Hints follow the active device.** Authored level text uses action tokens (`{interact}`, `{echo}`, …) rendered as
  the player's own key caps, Xbox / PlayStation / Switch glyphs or touch button names (HUD hint card, pause hint
  list, level intro, onboarding). A unit test rejects hardcoded key names in level text. Closes v0.3 issue 3.
- **Touch Action button** (Space context action), shown only while the faced object answers it (timed switches) or
  the chamber's solution uses it; same input path as the Space key. Closes v0.3 issue 4.
- **Short phone screens (≤ 360 px tall):** hints arrive as a small chip under the chamber card and expand on tap above
  the joystick zone. Closes v0.3 issue 5.
- **Keyboard rebind fix:** a pending rebind is cancelled by clicking any row or pressing any pad button. Closes v0.3
  issue 7.
- **Gameplay feedback:** new unhashed events `gateBlocked` and `elevatorHeld` with their own audio cues; held lifts
  pulse coral and shudder, held-open temporal gates show gold status lamps; spark bursts on door/gate/lift blocks;
  the character's head looks at what E would act on, else an upcoming echo target.
- **Colour-blind palette in 3D:** echo holograms, trails, badges and ghost paths now use exactly the timeline colours.
  Visible change in the default palette: Echo 3+ are violet / teal / lilac instead of all cyan.
- **Character turntable:** `graphics-preview.html?turntable=1` (front three-quarter studio view);
  `final-character.png` was regenerated from it.
- **Load path:** the attract-replay solution compiler and test harness are a lazy chunk loaded after the menu paints.
- **Offline play:** a service worker (`public/sw.js`, precache manifest written at build time) caches the built app
  for the home-screen web app; registered only in production, on HTTPS/localhost, never under automation; `?nosw`
  removes it. `render.yaml` serves `/`, `/index.html` and `/sw.js` with `no-cache`.

## v0.4 director checks (Chromium)

| Check | Result |
|---|---|
| `npm run verify` | **Pass**: typecheck clean, Vitest 44 files / 589 tests, none skipped, build OK (start and end of the pass) |
| Golden replays | **Pass, justified diff**: only `levelFingerprint` lines changed (9 lines: the 5 golden files of L01, L03, L07, L10 and the test chamber, plus 4 lines in `fuzz-fingerprints.golden.json`), because those levels' hint *text* changed to action tokens. Every per-tick hash, checkpoint, event count and completion tick is unchanged; the new events are not hashed. Accepted. |
| Full e2e suite (`CI=1 E2E_PORT=4815 npx playwright test`) | **18 passed, 0 failed** in 32.8 min, all visual baselines matched: **no re-bless** |
| Mobile spec re-run after the director's CSS fix (below) | **2 passed** (iPhone end to end; 740×340 hint chip + Action button) |
| Service worker under Playwright (webdriver) on a production preview | **Pass**: no registration, no caches, no console errors/warnings |
| Service worker on the dev server (webdriver spoofed off) | **Pass**: never registers |
| Service worker on a production preview (webdriver spoofed off) | **Pass**: registers, activates, controls the page, precaches 24 files into `recursion-1-<version>`; no console errors |
| Production preview boots with no console errors | **Pass** (automation and non-automation) |
| Main menu faster? | **Mixed, see below.** First painted menu frame unchanged (~10.3 s under SwiftShader); main thread becomes free ~3.5–4 s *later* |

**Golden diff detail:** `git diff src/testing/replays | grep '^[-+] ' | grep -v levelFingerprint` prints nothing.
The level-definition diffs are exactly the five hint strings (`Press E` → `Press {interact}`, `press R` →
`press {echo}`).

**Time to menu (director, idle machine, `vite preview`, fresh browser per run, `?quality=low`, 3 runs, medians, ms):**

| Build | DOMContentLoaded | First menu frame painted | FCP | Attract replay starts |
|---|---|---|---|---|
| Before round 4 load work (`dist-before`) | 4322 | 10328 | 12888 | 10327 |
| After (current tree) | 4325 | 10433 | 12600 | 15413 |

A long-task trace (2 runs each, 30 s) shows why "menu visible and responsive" got worse even though the first menu
frame did not move: before, three long tasks ending at ~14.6–16.0 s; now a fourth ~3.8–4.4 s task starts when the
attract replay switches to the known solution (~14–15 s) and ends at ~17.8–19.8 s. It is most likely the first frame with echo
holograms: shader programs that used to compile inside the first frame now compile in a second batch (inferred from the timing, not profiled). Measured
as "menu laid out and the page answering", 6 alternating runs at default quality: before 17.9 s, after 21.7 s. Under
SwiftShader this is a ~4 s input stall on the menu; on a real GPU it should be a small hitch, but it is unmeasured.
So **the main-menu load did not get faster on this machine**; the release engineer's "no regression, small gain"
measured only the first menu frame. Suggested follow-up (graphics/load owners): pre-warm the echo hologram materials
(`renderer.compile` / `compileAsync`) during boot or idle, or start the solutions import at boot so echoes exist in
the first frame.

**Director fix (minimal):** on touch, the gold verb tag above the Interact button ("ACTIVATE SWITCH") covered the
Timeline button and its label whenever the player faced a timed switch. The HUD's centre prompt already shows the
same verb (and the blocked state), so the tag is now hidden during touch play (`src/ui/touch/touchStyles.ts`, one
CSS rule); the Interact button keeps its ready glow and blocked colour.

Screenshots (overwritten): `docs/art-direction/screenshots/final-character.png` (turntable, front three-quarter,
player, high quality) and `final-mobile-hud.png` (iPhone 15 landscape, L05 facing the Drive Switch: Action button
visible, Interact ready). The hint chip only appears at ≤ 360 px tall, so it is not in the iPhone 15 shot; it was
reviewed in the 740×340 mobile-spec screenshots (scratchpad only).

## Check on real hardware (owner), new in v0.4

Everything in the v0.3 list below still applies. In addition:

1. **Offline:** install to the home screen over HTTPS, launch once online, then enable airplane mode and relaunch:
   the menu, a level and the attract replay should work. Check iOS storage eviction after days without launching,
   and that a new deploy is picked up (it takes over after the app is fully closed and reopened).
2. **`?nosw`** clears the worker and caches on iOS Safari.
3. **Render headers:** confirm the `/` rule only matches the root URL and `sw.js` is served `no-cache` on the live
   deploy.
4. **Menu boot on a real GPU:** time to an interactive menu, and whether the echo-hologram shader batch causes a
   visible hitch when the attract replay starts.
5. **Action button and hint chip** on a real small phone (≤ 360 px tall in landscape with browser bars), and the
   device-aware hint glyphs with real Xbox / PlayStation / Switch pads.
6. **Feedback feel:** held-lift shudder/pulse, gate lamps, spark bursts and the new `gateBlocked` / `elevatorHeld`
   sounds on real speakers and GPUs; the head-look glance.
7. **Echo colours:** art-direction sign-off on Echo 3+ being violet / teal / lilac in the default palette.

## v0.4 known issues

1. Real Safari/WebKit, touch hardware, controllers, GPUs and speakers untested (above). Mobile fps still unmeasured.
2. Menu interactivity is ~4 s later under SwiftShader because echo shaders now compile in a second batch (above).
3. Critical-path JS is unchanged (~361 kB gzip); bigger savings need lazy-loading touch UI and audio.
4. The attract solution still compiles synchronously once its chunk loads (up to ~0.3 s for L10 on desktop).
5. Whether a hint is a chip is decided when it appears; rotating/resizing while it is open does not re-collapse it.
6. The turntable's head-look-at-camera pose tilts the head noticeably at 35°; acceptable for review, not final art.
7. Still open from v0.3: Gamepad presses shorter than a frame can be missed; switching to Mobile mid-session needs a
   reload for half-resolution textures; home-screen and Safari storage are separate; the smoke flow test takes ~4 min.

## v0.4 tests run (director)

- `npm run verify` at the start and end of the pass: typecheck clean · Vitest 44 files, 589 tests passed, none skipped
  · build OK.
- Full Playwright suite `CI=1 E2E_PORT=4815 npx playwright test`: 18 passed in 32.8 min, no baselines re-blessed. Perf
  probe (SwiftShader): L10 high 0.40 fps / 376 draw calls / 0.77 M triangles; low 0.44 fps / 255 / 0.61 M (v0.3: 376 /
  253), so desktop rendering cost is essentially unchanged.
- `tests/e2e/mobile.spec.ts` re-run against a build with the director's CSS fix: 2 passed (3.7 min).
- Service-worker checks, time-to-menu and long-task traces: director scripts in the scratchpad (not committed).

Team reports: `docs/agent-progress/ux-input-round4.md`, `gameplay-feedback-round4.md`, `release-engineer-round4.md`;
director: `docs/agent-progress/director-round4.md`.

---

# v0.3 (round 3: controllers and iPhone)

Date: 2026-10-11 (v0.2 and v0.1: below) · Build: `npm run build` → static `dist/` (relative base path) · Reviewer: Game Director

This is an honest status report. "Verified" means checked by a test that was run for this release. **Every v0.3
browser check ran in Chromium only** (SwiftShader software WebGL): iPhone was emulated with Playwright's
`devices['iPhone 15']` (touch, isMobile, DPR 3, landscape 852×393, safe-area insets injected through CDP) and
controllers were mocked by overriding `navigator.getGamepads`. **Real Safari/WebKit, real touch screens and real
controllers were NOT tested.**

## v0.3 summary

The product owner asked for the browser game to be playable with game controllers and on iPhone (Safari, plus Add to
Home Screen running full screen), without becoming a native app. Round 3 delivers that through the existing input
abstraction: keyboard, controller and touch all produce the same `PlayerInput` / `GameCommand` stream (movement
quantized to -1/0/1 before the sampler; only `PlayerInput` is recorded). The simulation was not changed and all
golden replays pass unchanged.

- **Game controller** (standard Gamepad API mapping): full play and menu navigation, device-matched button glyphs
  (Xbox / PlayStation / Switch), hold-X restart with a fill ring, controller timeline scrubbing and track control,
  remapping in Settings → Controls → Gamepad, hot-plug toasts, auto-pause on disconnect, a button press skips the
  studio intro (polled from `index.html`'s inline script; the vendored intro is unchanged).
- **Touch / iPhone**: floating joystick, Interact / New echo / Timeline / Preview / Pause buttons, pinch zoom,
  two-finger tap for the overview camera, a touch timeline bottom sheet, hold-to-restart in the pause menu, a portrait
  "rotate your device" overlay, a compact phone layout with safe-area padding, prevention of iOS page zoom / rubber
  band / callouts, audio unlock on first tap.
- **Home-screen web app**: viewport-fit=cover and Apple meta tags, `manifest.webmanifest` (fullscreen, landscape),
  180/192/512/maskable icons, a dismissible "Add to Home Screen" hint in iOS Safari.
- **Mobile performance**: a new `mobile` quality preset chosen automatically on iPhone/iPad/Android (`auto` is the
  new default; explicit saved presets and `?quality=` are respected): pixel ratio ≤ 1.5, blob shadows instead of a
  shadow map, half-resolution bloom + FXAA, fewer particles/lights, reduced backdrop, a 13k-triangle character LOD,
  half-resolution procedural textures. Dynamic resolution (off under automation), WebGL context-loss recovery, and
  the frame loop / audio stop while the page is hidden.

## v0.3 cross-device checks (director, Chromium)

| Check | Result |
|---|---|
| Keyboard unchanged on desktop | **Pass**: movement, R echo, Tab timeline, Esc pause, key-cap hints; smoke + flows suites pass |
| Touch controls never appear on desktop without touch | **Pass**: no `rx-touchdev` / `rx-touch-on`, no joystick, buttons, rotate overlay or A2HS hint |
| Controller and keyboard interchangeable | **Pass**: one recording holds stick, D-pad and WASD moves, all -1/0/1; pad Menu pauses, Esc resumes |
| Prompts swap glyphs | **Pass**: Xbox glyphs after pad use, key caps after a key; touch names on iPhone; a key press on a touch device hides the on-screen controls and a tap restores them |
| Portrait overlay | **Pass**: shown at 393×852, hidden again in landscape |
| Safe areas (iPhone 15 landscape insets 59/59/0/21 px) | **Pass**: menu buttons, HUD cards, touch buttons, timeline strip and Settings stay inside the insets |
| No console errors | **Pass** in every desktop, controller and iPhone session |
| All 10 levels complete via the debug hook under iPhone emulation | **Pass** (L01–L10, verified solutions, no page errors) |
| Settings quality row (6 presets) at phone width | **Pass**: fits at 852×393 |

Screenshots (overwritten/added): `docs/art-direction/screenshots/final-mobile-menu.png`, `final-mobile-hud.png`
(L05 mid-solve, two echoes), `final-mobile-timeline.png` (touch timeline sheet), `final-gamepad-prompts.png` (Xbox
glyphs in the HUD and tutorial card).

## Check on real hardware (owner)

None of this has run on a device. Please check:

1. **iPhone Safari tab**: the game loads over HTTPS, renders, and the Mobile preset holds a playable frame rate
   (target 30 fps; fps on a real GPU was never measured). Watch thermal throttling over 10+ minutes.
2. **Add to Home Screen**: icon and name, launches full screen in landscape, the translucent status bar and the
   Dynamic Island / home indicator do not cover HUD cards or touch buttons (safe-area padding was only emulated).
3. **Touch feel**: joystick deadzone and size, multi-touch (stick + Interact together), pinch never zooms the page,
   no text-selection or callouts on long press, the 0.75 s hold-to-restart, the timeline sheet drag-scrub.
4. **Audio** unlocks on the first tap on iOS (including after the silent switch and after returning from background).
5. **Background / lock**: the game pauses and resumes without a catch-up burst; WebGL context loss after a long
   background restores correctly.
6. **Controllers**: Xbox, PlayStation (DualSense/DualShock) and Switch Pro on desktop Chrome/Edge/Firefox/Safari and
   on iOS Safari. Check glyph detection from the pad id, stick deadzone (0.35) and trigger threshold (0.5), that
   Safari's "press a button first" connection works, hot-plug and the disconnect auto-pause, and that a button press
   skips the studio intro.
7. **iPad** with and without a keyboard: auto-picks Mobile, controls hide on key press and return on touch.

## v0.3 known issues

1. Real Safari/WebKit, touch hardware and controllers untested (above). Mobile fps is unmeasured; L10 on Mobile is
   still ~270 draw calls (18 per-bone meshes per character, ~0.2 M triangles of static kit without LOD).
2. The Gamepad API has no button events: a press shorter than one animation frame can be missed (presses seen in a
   frame are latched to the next tick).
3. Authored level hint texts still say "Press E…" on touch and controller; tutorial cards and prompts do switch.
4. No touch button for the Space context action (no level uses it today).
5. On very short screens (343 px tall) the hint card can sit over the left thumb area (it is narrower there and can be
   collapsed).
6. Switching to Mobile in Settings mid-session applies everything except the half-resolution textures (on reload).
7. While a keyboard rebind waits for a key, pressing A on another row starts a new keyboard rebind (minor).
8. iOS keeps home-screen app storage separate from Safari's, so progress does not carry over between them.
9. The smoke flow test now takes ~4 min under SwiftShader; its budget was raised from 240 s to 360 s (see below).

## v0.3 tests run (director)

- `npm run verify` (start and end of the director pass): typecheck clean · Vitest **37 files, 533 tests passed**, no
  skipped tests · build OK. Golden replay files unchanged (no diff under `src/testing/replays`).
- Targeted Playwright run (`CI=1 E2E_PORT=4711`: `gamepad.spec.ts`, `mobile.spec.ts`, `smoke.spec.ts`,
  `flows.spec.ts`, 29.2 min): **9 passed, 1 failed**. The smoke flow test hit its 240 s timeout while the director's
  screenshot scripts were competing for the 4 CPUs (the failure context shows the pause menu had already closed).
  Re-run alone: passed in 3.9 min, i.e. right at the budget even on an idle machine, so its timeout was raised to 360 s.
- Full Playwright suite (`CI=1 E2E_PORT=4713 npx playwright test`, 26.9 min): **17 passed, 0 failed**, including the
  gamepad and iPhone specs, the all-10-levels sweep and all visual baselines. **No baselines were re-blessed.**
- Perf probe (SwiftShader, not meaningful for real GPUs): L10 high 0.43 fps / 376 draw calls / 0.77 M triangles,
  low 0.48 fps / 253 / 0.60 M; identical draw calls to v0.2, so desktop rendering did not change.
- Director cross-device scripts (Chromium, scratchpad only): desktop keyboard 12/12, mocked Xbox pad + keyboard 8/9
  (the one miss was the check script's own baseline: the HUD had already switched to pad glyphs on connect),
  iPhone 15 emulation 9/10 (the one miss was a decorative menu ring drawn past the left edge on purpose; every button
  and text block is inside the safe area), all 10 levels under iPhone emulation 11/11, no console errors anywhere.

Team reports: `docs/agent-progress/gamepad-input-round3.md`, `mobile-touch-round3.md`, `mobile-perf-round3.md`;
director: `docs/agent-progress/director-round3.md`.

---

# v0.2 (round-2 gap-fix review)


Date: 2026-10-11 (v0.1: 2026-10-10) · Build: `npm run build` → static `dist/` (relative base path) · Reviewer: Game Director

This is an honest status report against the master plan's **Definition of Done**. "Verified" means checked by a
test that was run for this release; "unverified" means nobody has been able to measure it yet.

## Summary

The full game loop works end to end in the browser: boot → main menu (live attract replay) → level intro →
record / rewind / cooperate with echoes → timeline inspect and temporal preview → level complete → next chamber,
with pause, settings, level select, save/continue and procedural audio throughout. All 10 campaign chambers load,
render and complete with their verified solutions both headlessly and in the real app. Round 2 closed the three
known physics bugs (QA-1/2/3), added Q-preview ghost paths and walk-on badges, wired camera sensitivity and reduced
motion into the renderer, rebuilt the protagonist and echo hologram, and rendered the full decor vocabulary with
varied wall modules. The biggest open risk is still **real-GPU performance and feel (never measured)**; visual
fidelity is closer to the concept sheet but still procedural (simple face, mitten hands, rigid joints).

## Definition of Done — status

| Requirement | Status | Evidence / notes |
|---|---|---|
| 10 playable levels with verified solutions | **Done** | `src/levels` tests: every level validates, solves within its echo limit with 3 stars, fails with the final run alone and with any single loop solo. E2E sweep completes all 10 in the browser. Minimum echo counts are argued, not exhaustively proven. |
| Deterministic echoes | **Done** | Integer simulation, seeded RNG, per-tick hashes; golden replays for all 10 levels + test chamber re-simulate bit-for-bit; seeded fuzzing with invariants after every tick. |
| All 12 puzzle components | **Done** | Plates, doors, timed switches (with cooldown), crates, cells, sockets, elevators, laser emitters/receivers, temporal gates, moving platforms, exit portals. Round 2 fixed QA-1 (deck walk surface is its real 1x1 extent; riders move with it in the same tick), QA-2 (an occupied temporal gate stays open until clear) and QA-3 (a lift never moves into a body; it waits in place). The three repros are now normal passing tests plus 14 edge-variant regressions, and the fuzzer no longer excuses them (20 000-tick, 4-seed run clean). |
| Nested loops (L08) | **Done** | `recursion: { delayTicks, copies }`; copies are ordinary echoes with their own divergence checks. Timeline now labels copies "Echo 1 ↻2" with an offset, dashed bar. |
| Timeline inspect / modify | **Done** | Track per echo, ruler, playhead, interaction markers, divergence highlights, scrubbing (3D view shows the scrubbed moment), pause, delete / hide / select loops, zoom, high-contrast palette option. |
| In-world indicators (which echo activates what, when) | **Done** | Numbered countdown badges above every object an echo will use in the next 4 s; walk-on badges (segmented ring) over pressure plates and ride-lifts; dashed ghost paths with second markers while Q is held. Walk-on badges and ghost paths come from a deterministic echo forecast run in a Web Worker; like the Q preview they assume the player stands still. |
| Cohesive premium visuals | **Mostly done** | Concept palette and language throughout. Round 2: new protagonist (white/ivory armour panels with gold edge glow, pauldrons, backpack time device, hair buns; 18 draw calls per character, ~8.6k triangles) and a panel-preserving cyan echo hologram; 9 wall modules per face, all authored decor types render (archway, 9 machinery variants, hologram, banner, abyss light), deeper backdrop. Still procedural: simple face, mitten hands, rigid joints, no textures on the character. |
| Polished animation / VFX | **Mostly done** | Procedural run/idle/carry/interact animation (round 2: corrected gait phase, breathing and weight-shift idle, reach/lift/place gestures, landing squash, head look toward the faced cell), echo manifest, rewind (screen-space + snapshot playback), divergence glitch, door/portal/laser effects, completion flash. Feel at 60 fps is unverified (see performance). |
| Audio | **Done** | Fully procedural SFX for every event class, ambience, adaptive music (menu / explore / solving / completion). No distinct sound yet for nested-loop copies. |
| Save / load | **Done** | Progress, best runs, settings, key bindings and in-progress echoes (saved on commit/delete, restored by Continue); corrupt/oversized saves load safely. |
| Browser tests pass | **Done** (see Tests below) | Smoke, flows, all-levels sweep, visual regression, perf probe. One flow test and two 3D baselines were updated for intended round-2 changes. |
| Performance targets (60 fps desktop / 30 fps low-end) | **Unverified** | Only measured under software rendering (SwiftShader, ~0.5 fps), which says nothing about real GPUs. L10 perf probe: 376 draw calls / 0.77 M triangles (high), 253 / 0.60 M (low). Triangles are up ~30% from round 2 art, draw calls about flat. The simulation itself costs ≤0.13 ms/tick. `npm run test:e2e:perf` must be run on real hardware. |
| Deployable static build | **Done** | `vite build` with `base: './'`; `dist/` works from any static host or sub-folder; three.js in its own cacheable chunk. |
| 60–120 min of play | **Unverified** | 10 chambers exist; par times total ~3 min of optimal play, so real play time depends on puzzle difficulty, which needs human playtests. |

## What changed in round 2 (gap-fix team)

Physics / gameplay (simulation changed deliberately; golden replays for L04, L05, L10 and one fuzz fingerprint
re-blessed — L04 completes one tick earlier, L05/L10 changed only mid-ride checkpoints)
- QA-1, QA-2, QA-3 fixed at the root (see the components row). New additive `SurfaceCell.clip` contract field and
  tick step 4b (riders carried in the same tick as their deck/lift); documented in `docs/architecture/contracts.md`.
- A lift can now pause mid-shaft (`state.held`) while someone straddles its edge.

Character
- New stylized protagonist following the concept turnaround (`src/graphics/animation/characterModel.ts`), shared
  geometry for player and echoes, 45 → 18 draw calls per character. Echo hologram keeps the panel pattern, shows
  only its nearest surface and stays cyan on bright floors.

Environment
- All authored decor types render (`src/graphics/environment/decor.ts`); 9 wall modules chosen per face, trims and
  caps; quadrant-plate floor tiles, framed grates, brass inlays; three tower bands, 70 spires, 9 clockwork rings,
  light shafts. L10 static kit 71 → 63 draw calls, backdrop 38 → 17.

UX / indicators
- Echo forecast (Web Worker) feeding Q-preview ghost paths and walk-on badges.
- `GameRenderer.setComfort()`: camera sensitivity scales wheel zoom and follow speed; reduced motion disables the new
  small camera shake (rewind, divergence, completion), shortens the intro fly-in (3.4 s → 1.1 s), damps rewind /
  glitch distortion and halves particle bursts.
- `?quality=` overrides are shown in Settings and lock the quality selector; an unknown value falls back to the
  saved preset (it used to force High).
- The attract replay pauses under menu sub-screens. A crate carried by a hidden echo is hidden with it.

Integration (director)
- `tests/e2e/flows.spec.ts` settings test boots without `?quality=` (the override now locks the selector) and gains
  a check of that lock. `tests/e2e/smoke.spec.ts` writes its review screenshots to the git-ignored `test-results/`
  instead of `docs/`. 3D visual baselines re-blessed after side-by-side review.
- Q-preview ghost-path ribbon widened (0.22 → 0.36 world units): the preview switches to the overview camera, where
  the thinner trail was hard to read.

## What changed in the v0.1 director's polish pass

Visual / camera
- **Closer follow camera** (distance 15–25 instead of 16–36): the characters now read as silhouettes at the
  concept-sheet scale instead of 50-pixel figures; wheel zoom still widens it.
- **Framing above docked UI:** the camera's projection is lifted so the subject is centred in the area above the
  timeline (6% normally, 16% with the expanded timeline). The timeline overview now fits the chamber's
  foreshortened footprint into that free area instead of a conservative bounding sphere, so chambers fill the view.
- **Main menu backdrop:** now a closer cinematic follow of the attract replay, shifted right of the title column
  (was a dark, distant overview).
- **Brass no longer reads olive:** horizontal brass (pillar caps, wall rails) mirrored the navy sky under the
  43° camera. The environment map gained a warm vaulted-ceiling band at 25–65° elevation, so brass reads gold and
  floors pick up the warm key.
- **Chromatic aberration** reduced from a full-frame 2 px fringe to a subtle corner-only effect (rewind and glitch
  effects unchanged).
- **Solid wall mass** behind chamber walls is plated as dark exterior decking instead of bare black foundation,
  so the overview reads as built structure.
- Replaced the deprecated `PCFSoftShadowMap` (console warning on every boot) with `PCFShadowMap`.

Gameplay readability / UI
- **In-world echo intent badges** (new `src/graphics/effects/echoIntents.ts`, fed from `TemporalGame.getTimeline()`
  through the new `GameRenderer.setTimeline()`; read-only).
- **Tutorial and hint cards step aside** during timeline inspect and temporal preview.
- **Level-complete card:** Best time now uses the same precision as Time (`0:04.77` / `0:04.77`).
- **Nested-loop copies** labelled and offset on the timeline; hiding an echo also hides its copies.
- Debug hook: `runSolution({ untilTick })` stops a verified solve mid-way (used for mid-solve screenshots).

## Known issues

1. Real-GPU performance and input feel unmeasured; intro fly-in timing, camera damping and the new camera shake
   were only judged from software-rendered frames. The first forecast (ghost paths / walk-on badges) appears after a
   few frames under SwiftShader; on a real GPU it should take ~100 ms (unmeasured).
2. Walk-on badges and ghost paths are predictions that assume the player stands still; they update as the player acts.
3. The head looks toward the faced cell, not the nearest interactable (`ActorVisual.setLookTarget` exists but the
   renderer does not call it yet).
4. A held lift (`state.held`) and a temporal gate held open by an occupant have no dedicated visual or audio cue
   (no `gateBlocked` event yet).
5. Character: simple face, mitten-like hands, rigid joints; ~8.6k triangles each (cost grows with echoes and
   nested-loop copies). Echoes render opaque with depth, so transparent effects directly behind an echo are hidden.
6. Some void-cell machinery (e.g. L01 pylons) is seen edge-on from the default camera; adjustable per decor `facing`.
7. The colour-blind-safe echo palette applies to the UI, not to 3D echo colours, badges or ghost paths.
8. No distinct sound for nested-loop copies.
9. The e2e suite takes ~26 minutes under software WebGL.
10. `docs/art-direction/screenshots/` still holds ~50 MB of superseded iteration screenshots (`v*-*`, `ui-*`,
    `levels-*`, `integration-*`): deleting them was blocked by this session's permissions and is left to a human.

## Recommended next milestones

1. **Real-hardware pass (highest priority):** run `npm run test:e2e:perf` and play on a mid-range and a low-end
   GPU; tune the quality presets to 60/30 fps (watch triangle counts with many echoes); tune camera damping,
   shake, intro length, forecast latency and movement feel.
2. **Human playtests** of L05–L09: tune hint timing, par times and difficulty; measure real play time against the
   60–120 min target; check that walk-on badges and ghost paths read clearly.
3. **Character fidelity:** skinned mesh or better joints, hands, face texture; wire `setLookTarget` to the nearest
   interactable.
4. **Feedback for blocking states:** held-lift visual, `gateBlocked` event with an audio cue; colour-blind palette
   for 3D echoes, badges and ghost paths; a sound for nested-loop copies.
5. **Repo hygiene:** delete the superseded screenshots listed in known issue 10.
6. **Input:** gamepad support behind the existing input resolver; key-remap e2e coverage.
7. **Bundle:** consider lazy-loading the harness/solution data used only by the attract replay.

## Tests run for this release (round 2, 2026-10-11)

- `npm run verify` (start and end of the director's round-2 pass): typecheck clean · Vitest 30 files,
  **451 passed, 0 expected-fail** (the QA-1/2/3 repros are ordinary tests now) · build OK.
- Full Playwright suite (`CI=1 E2E_PORT=4321 npx playwright test`, 25.7 min): **12 passed, 3 failed**, all from
  intended round-2 changes: the settings-persistence flow (a `?quality=low` URL override now locks the quality
  selector, so the test could not click "Medium") and the two L03 3D baselines (6% pixels different: new wall
  modules, archway, hologram, backdrop). All-10-levels sweep, smoke flow, Continue/restart, pause, timeline,
  level select, perf probe and UI visual tests passed.
- Fixes: settings test boots without the override and now also asserts the lock; all four 3D baselines re-blessed
  after side-by-side review (chamber and showcase still passed against the old look within tolerance, so they were
  re-blessed too). Re-run of `visual.spec.ts` + the settings test: **7/7 passed**.
- Perf probe (SwiftShader, not meaningful for real GPUs): L10 high 0.41 fps / 376 draw calls, low 0.48 fps / 253.
- Screenshot driver (`final-*.png`): all 10 chambers completed with their verified solutions in the real app, no
  page errors.

Exact commands and details: `docs/agent-progress/director-round2.md` (round 2) and
`docs/agent-progress/director-final.md` (v0.1).
