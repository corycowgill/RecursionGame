# RECURSION

**A 3D temporal puzzle adventure for the desktop browser.** Record a run, rewind, and play alongside the echo of
your past self. Every completed loop becomes an echo that replays your exact inputs in the same deterministic
world, so your solutions are built out of coordinated recordings: one echo holds a plate, another carries a power
cell through a door that is only open because a third pressed a switch eight seconds earlier.

- 10 handcrafted chambers (First Echo → The Core), each with a verified solution, echo limit, par time and hints
- One deterministic 60 Hz simulation shared by the player and every echo (integer maths, seeded RNG, state hashes)
- Paradoxes are real: if an echo's recorded action can no longer happen, it fails visibly and the timeline marks
  the divergence; nothing is faked to keep a recording "working"
- A signature temporal timeline (track per echo, interaction markers, scrubbing, delete / hide loops) and
  in-world badges showing which echo will use which object, and when
- Stylized sci-fi visuals in Three.js (PBR materials, procedural textures, bloom, colour grade), fully
  procedural audio, save/load and quality presets

Product brief: [`docs/game-design/master-plan.md`](docs/game-design/master-plan.md) ·
Visual target: [`docs/art-direction/concept-sheet.png`](docs/art-direction/concept-sheet.png) ·
Current status: [`docs/agent-progress/release-notes.md`](docs/agent-progress/release-notes.md)

## Controls

| Key | Action |
|---|---|
| **W A S D** / arrows | Move (relative to the camera) |
| **E** | Interact (switches, crates, cells, sockets, lifts) |
| **Space** | Context action |
| **R** | End the recording: it becomes an echo and the chamber rewinds (at the echo limit, R discards the take) |
| **Shift + R** | Restart the chamber (removes all echoes) |
| **Tab** | Expand the timeline: time freezes, the camera pulls back, scrub with mouse or ←/→ |
| **Hold Q** | Temporal preview: watch your echoes play out the rest of the loop (the live game is untouched) |
| **1 – 5** | Select an echo · **Delete** removes the selected echo |
| **Esc** | Pause (settings, hints, level select) |
| Mouse wheel | Camera zoom |

Key bindings, volumes, quality, interface scale and accessibility options (reduced motion, a colour-blind-safe
echo palette) are in **Settings**. Audio starts on the first click or key press.

## Running

Requires Node 20+ (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173 — hot-reloading dev server
```

URL options: `?quality=low|medium|high` forces a renderer preset (handy on weak GPUs and in tests).
`graphics-preview.html` is a standalone renderer test bed (`?scene=level&id=3`, `?scene=showcase`).

## Building and deploying

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally on http://localhost:4173
```

`dist/` is a fully static site with a **relative base path** (`base: './'`), so it can be dropped into any static
host or sub-folder (GitHub Pages, Netlify, S3/CloudFront, itch.io HTML5 upload, `python -m http.server`) with no
server configuration. There is no backend: progress and settings are stored in the browser's `localStorage`.

## Testing

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit/integration suite: engine determinism, all 12 puzzle components, every level's verified solution, golden replays, seeded fuzzing, save/load, UI, audio, camera |
| `npm run verify` | typecheck + unit tests + production build in one go |
| `npm run test:e2e` | Playwright browser suite (smoke flow, menus/timeline/pause flows, every level completes in the real app, visual regression). Builds and serves `dist/` itself |
| `npm run test:fuzz` | Heavy seeded fuzz run (`FUZZ_TICKS`, `FUZZ_SEEDS`) |
| `npm run replays:update` | Re-bless the golden replays after an intentional level change |
| `npm run test:e2e:update-snapshots` | Re-bless the visual-regression baselines after an intentional visual change (review the PNG diffs) |
| `npm run test:e2e:perf` | FPS measurement — meaningful only on a real GPU |
| `npm run bench` | Simulation tick-cost benchmark |

Headless Chromium renders WebGL in software (SwiftShader, ~1–2 fps), so the e2e suite drives the deterministic
simulation through the `window.__RECURSION__` debug hook instead of wall-clock timing and takes ~20 minutes.
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
    input/      keyboard → PlayerInput / GameCommand
    rendering/  GameRenderer facade, camera rig, post-processing, quality presets
    audio/      procedural SFX, ambience, adaptive music
  gameplay/     the 12 puzzle components (plates, doors, timed switches, crates, cells, sockets, elevators,
                lasers, receivers, temporal gates, moving platforms, exit portals)
  graphics/     procedural materials/textures, environment kit, entity visuals, characters, VFX, shaders
  levels/       the 10 campaign chambers + validators
  persistence/  save data, settings, key bindings (localStorage)
  ui/           HUD, temporal timeline, menus and overlays (DOM)
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
