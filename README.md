# RECURSION

**A 3D temporal puzzle adventure for the browser: desktop with keyboard or game controller, and iPhone (Safari or Add to Home Screen, full screen) with touch.** Record a run, rewind, and play alongside the echo of
your past self. Every completed loop becomes an echo that replays your exact inputs in the same deterministic
world, so your solutions are built out of coordinated recordings: one echo holds a plate, another carries a power
cell through a door that is only open because a third pressed a switch eight seconds earlier.

- 10 handcrafted chambers (First Echo → The Core), each with a verified solution, echo limit, par time and hints
- One deterministic 60 Hz simulation shared by the player and every echo (integer maths, seeded RNG, state hashes)
- Paradoxes are real: if an echo's recorded action can no longer happen, it fails visibly and the timeline marks
  the divergence; nothing is faked to keep a recording "working"
- A signature temporal timeline (track per echo, interaction markers, scrubbing, delete / hide loops),
  in-world badges showing which echo will use or step on which object, and when, and ghost paths of every echo's
  route while you hold Q
- Stylized sci-fi visuals in Three.js (PBR materials, procedural textures, bloom, colour grade), fully
  procedural audio, save/load and quality presets
- Three input devices, one input stream: keyboard, game controller (standard Gamepad API mapping) and on-screen
  touch controls all produce the same `PlayerInput` / `GameCommand` stream, so echoes and replays are identical
  whatever you played with. Button prompts follow the device you used last

Product brief: [`docs/game-design/master-plan.md`](docs/game-design/master-plan.md) ·
Visual target: [`docs/art-direction/concept-sheet.png`](docs/art-direction/concept-sheet.png) ·
Current status: [`docs/agent-progress/release-notes.md`](docs/agent-progress/release-notes.md)

## Controls

Every device feeds the same input abstraction (`src/engine/input`): movement is quantized to -1/0/1 before it
reaches the simulation, and only `PlayerInput` is ever recorded. You can switch devices at any time; the on-screen
prompts (HUD hints, tutorial cards, timeline legend) swap to the device you touched last.

### Keyboard

| Key | Action |
|---|---|
| **W A S D** / arrows | Move (relative to the camera) |
| **E** | Interact (switches, crates, cells, sockets, lifts) |
| **Space** | Context action |
| **R** | End the recording: it becomes an echo and the chamber rewinds (at the echo limit, R discards the take) |
| **Shift + R** | Restart the chamber (removes all echoes) |
| **Tab** | Expand the timeline: time freezes, the camera pulls back, scrub with mouse or ←/→ |
| **Hold Q** | Temporal preview: watch your echoes play out the rest of the loop, with each echo's future path drawn on the floor (the live game is untouched) |
| **1 – 5** | Select an echo · **Delete** removes the selected echo |
| **Esc** | Pause (settings, hints, level select) |
| Mouse wheel | Camera zoom |

### Game controller

Standard-mapping controllers (Xbox, PlayStation, Switch Pro; USB or Bluetooth). Prompts use the matching glyphs
(A/B/X/Y, ✕○□△, or Switch letters by position). Buttons are remappable in **Settings → Controls → Gamepad**; the
left stick, D-pad and Menu/Start are fixed so you cannot lock yourself out. Safari only reports a controller after
its first button press.

| Button (Xbox names) | In a chamber | In menus |
|---|---|---|
| Left stick / D-pad | Move (8 directions) | Move focus (auto-repeat while held) |
| **A** | Interact | Confirm |
| **B** | Context action | Back |
| **Y** | New echo (same as R) | |
| **Hold X** (0.6 s) | Restart the chamber (a ring fills around the prompt) | |
| **View** | Expand / collapse the timeline | |
| **Menu** | Pause | |
| **LT** (hold) | Temporal preview | |
| **LB / RB** | Select previous / next echo | |
| Right stick | Camera zoom | |

Timeline expanded: ←/→ scrub (speeds up while held), ↑/↓ select a track, **A** hide/show the echo (play/pause on the
player track), **X** delete the selected echo, **RB** zoom, **B** return to live, then close. Unplugging a controller
during play pauses the game. A button press also skips the studio intro.

### Touch (iPhone, iPad, Android)

Play in landscape; in portrait a "rotate your device" overlay appears and a running chamber pauses. The controls
appear only on touch devices, and only while touch was the last device used (a key press or controller button hides
them; the next touch brings them back).

| Control | Action |
|---|---|
| Drag anywhere on the left half | Floating joystick: move |
| **Interact** button | Interact |
| **New echo** button | End the recording (same as R) |
| **Timeline** button, or tap the timeline strip | Open the timeline sheet; drag the lanes to scrub |
| **Preview** button (hold) | Temporal preview |
| Pause button (top corner) | Pause |
| Pinch | Camera zoom |
| Quick two-finger tap | Toggle the puzzle overview camera |
| Pause → **Restart chamber** | Hold 0.75 s (prevents accidental restarts) |

The joystick and a button work at the same time. There is no touch button for the Space context action (no level
needs it yet). Audio starts on the first tap.

Key bindings, gamepad buttons, volumes, quality, camera sensitivity, interface scale and accessibility options
(reduced motion, which also removes camera shake and shortens the intro fly-in; a colour-blind-safe echo palette for
the UI) are in **Settings**. Audio starts on the first click, key press or tap.

## Playing on iPhone

RECURSION is a web page, not a native app. On iPhone:

1. Open the game's HTTPS URL in **Safari** (it also runs in a normal Safari tab, in landscape).
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Launch it from the new home-screen icon: it opens full screen in landscape, without Safari's address bar.

The main menu shows a dismissible "Add to Home Screen" hint in Safari. Progress is stored in the browser's
`localStorage`; iOS keeps the home-screen app's storage separate from Safari's, so progress does not carry over
between the two. On iPhone, iPad and Android the renderer picks the lighter **Mobile** quality preset automatically
(Settings → Quality → Auto).

**HTTPS is required.** iOS only installs home-screen web apps from secure origins, and browsers expose the Gamepad
API only on secure contexts (HTTPS or `localhost`). The Render deployment (`render.yaml`) serves over HTTPS, so it
works as is; any other host must also serve HTTPS.

> Touch, controller and iPhone support were built and tested only in Chromium (iPhone 15 emulation and a mocked
> controller). Real Safari/WebKit, real touch screens and real controllers have not been tested yet; see the
> hardware checklist in [`docs/agent-progress/release-notes.md`](docs/agent-progress/release-notes.md).

## Running

Requires Node 20+ (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173 — hot-reloading dev server
```

URL options: `?quality=auto|mobile|low|medium|high|ultra` forces a renderer preset for the session (handy on weak GPUs and in
tests); Settings then shows it and locks the quality selector. An unknown value is ignored.
`graphics-preview.html` is a standalone renderer test bed (`?scene=level&id=3`, `?scene=showcase`).

## Building and deploying

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally on http://localhost:4173
```

`dist/` is a fully static site with a **relative base path** (`base: './'`), so it can be dropped into any static
host or sub-folder (GitHub Pages, Netlify, S3/CloudFront, itch.io HTML5 upload, `python -m http.server`) with no
server configuration. There is no backend: progress and settings are stored in the browser's `localStorage`.
`public/manifest.webmanifest`, the Apple meta tags in `index.html` and the icons in `public/icons/` make it
installable as a full-screen home-screen web app. `render.yaml` deploys it to Render as an HTTPS static site.

## Testing

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit/integration suite: engine determinism, all 12 puzzle components, every level's verified solution, golden replays, seeded fuzzing, save/load, UI, audio, camera |
| `npm run verify` | typecheck + unit tests + production build in one go |
| `npm run test:e2e` | Playwright browser suite (smoke flow, menus/timeline/pause flows, every level completes in the real app, visual regression, mocked-controller flow, iPhone-emulated touch flow). Builds and serves `dist/` itself |
| `npm run test:fuzz` | Heavy seeded fuzz run (`FUZZ_TICKS`, `FUZZ_SEEDS`) |
| `npm run replays:update` | Re-bless the golden replays after an intentional level change |
| `npm run test:e2e:update-snapshots` | Re-bless the visual-regression baselines after an intentional visual change (review the PNG diffs) |
| `npm run test:e2e:perf` | FPS measurement — meaningful only on a real GPU |
| `npm run bench` | Simulation tick-cost benchmark |

Headless Chromium renders WebGL in software (SwiftShader, ~1–2 fps), so the e2e suite drives the deterministic
simulation through the `window.__RECURSION__` debug hook instead of wall-clock timing and takes ~26 minutes.
Run it with `CI=1` (fresh preview server) and, when other servers may be running, a private port:
`CI=1 E2E_PORT=4311 npm run test:e2e`.

## Architecture

```
src/
  app/          bootstrap + frame loop, app flow (menu → intro → play → complete), debug hook
  engine/
    contracts/  shared types and rules (the source of truth for every module)
    simulation/ fixed 60 Hz tick stepper, interactions/ownership, signals, hashing, nested loops
    temporal/   TemporalGame: recording, rewind, echoes, divergence, snapshots, timeline
    physics/    integer terrain + collision
    input/      keyboard, gamepad (and the touch sampler source) → PlayerInput / GameCommand
    rendering/  GameRenderer facade, camera rig, post-processing, quality presets
    audio/      procedural SFX, ambience, adaptive music
  gameplay/     the 12 puzzle components (plates, doors, timed switches, crates, cells, sockets, elevators,
                lasers, receivers, temporal gates, moving platforms, exit portals)
  graphics/     procedural materials/textures, environment kit, entity visuals, characters, VFX, shaders
  levels/       the 10 campaign chambers + validators
  persistence/  save data, settings, key bindings (localStorage)
  ui/           HUD, temporal timeline, menus and overlays (DOM), device glyphs, controller focus navigation,
                touch controls (ui/touch)
  testing/      headless harness, golden replays, fuzzing, QA invariants, benchmarks
tests/e2e/      Playwright suites
```

Data flows one way: input → `TemporalGame.step()` (the only place gameplay state changes) → read-only `SimView`
plus events → renderer, UI and audio. Nothing visual or audible feeds back into the simulation. Details:
[`docs/architecture/overview.md`](docs/architecture/overview.md) and
[`docs/architecture/contracts.md`](docs/architecture/contracts.md). Level design notes and walkthroughs:
[`docs/game-design/levels.md`](docs/game-design/levels.md). Art bible:
[`docs/art-direction/art-bible.md`](docs/art-direction/art-bible.md).

## Team structure

RECURSION was built by a team of specialised AI agents working in parallel on one repository, each owning a
module and reporting in [`docs/agent-progress/`](docs/agent-progress/):

| Role | Owns |
|---|---|
| Game Director | product vision, integration (`src/app`), final quality gate and polish |
| Temporal Systems Engineer | contracts, simulation, temporal engine, physics, input |
| Gameplay / Puzzle Engineer | the 12 puzzle components and interaction rules |
| Level Designer | the 10 campaign chambers, solutions, hints, level docs |
| Graphics Engineer | renderer, camera, materials, environment kit, characters, VFX |
| UI / UX Designer | HUD, timeline, menus, settings, persistence UI |
| Audio / VFX | procedural sound, music states, event-driven effects |
| QA Engineer | harness, golden replays, fuzzing, Playwright suites, benchmarks |

Rules the team works by: interfaces before parallel work, clear module ownership, small tested changes, never
duplicate the temporal engine or bypass determinism, and never claim a test passed without running it.
