# RECURSION — Architecture Overview

Stack: TypeScript (strict, `noUncheckedIndexedAccess`), Three.js, Vite, Vitest, Playwright.
Contracts: [`contracts.md`](./contracts.md). Product brief: `docs/game-design/master-plan.md`.

## Module map and ownership

| Path | Purpose | Owner |
|---|---|---|
| `src/main.ts`, `src/app/*` | Bootstrap, game loop wiring, level flow, interim `BootView` | **Director** |
| `src/engine/contracts/*` | Shared types and rules (change additively; note it in your report) | **Temporal engineer** (shared) |
| `src/engine/simulation/*` | Tick stepper (`stepSim`), interactions/ownership, registry, RNG, hashing, `FixedStepper` | **Temporal engineer** |
| `src/engine/temporal/*` | `TemporalGame` (loops, echoes, rewind, snapshots, timeline), loop encoding | **Temporal engineer** |
| `src/engine/physics/*` | Terrain surfaces, deterministic collision | **Temporal engineer** |
| `src/engine/input/*` | Keyboard → `PlayerInput` / `GameCommand` (browser-only) | **Temporal engineer** |
| `src/engine/rendering/*` | Renderer, scene graph, camera, interpolation | **Graphics** |
| `src/graphics/{materials,shaders,effects,animation}` | PBR materials, shaders, VFX, character animation | **Graphics** |
| `src/engine/audio/*` | Procedural audio, music states, event → sound | **Audio** |
| `src/gameplay/{entities,interactions,puzzles,player}` | Entity behaviours (all 12 kinds), puzzle helpers | **Gameplay engineer** |
| `src/levels/{definitions,loaders,validators}` | 10 campaign levels + validation | **Level designer** |
| `src/ui/{hud,timeline,menus}` | HUD, temporal timeline, menus, overlays (`#ui` root) | **UI** |
| `src/persistence/*` | Save/load (use `encodeLoop`/`decodeLoop`) | **UI / Director** |
| `src/testing/{harness,replays,benchmarks}`, `tests/e2e` | Headless harness, replays, perf, Playwright | **QA** (harness bootstrapped by the temporal engineer) |

Dependency direction: `app → (ui, rendering, audio, gameplay, levels) → engine`.
Rules: **the engine never imports gameplay, rendering, UI or audio**; gameplay never imports Three.js.

## Data flow

```
 keyboard ──► KeyboardInput ──► InputSampler.sample(tick) ──► PlayerInput ─┐
                    │                                                      │
                    └──► GameCommand (R, Shift+R, Tab, Esc, Q, 1-5) ──► app ──► TemporalGame API
                                                                           │   (commit/reset/restart/delete)
 requestAnimationFrame ─► FixedStepper.advance(dt) ─► n × TemporalGame.step(input)
                                                           │
                         ┌─────────────────────────────────┴──────────────────────────┐
                         │ TemporalGame (authority)                                   │
                         │  loops[] ─► echo frames ─┐                                 │
                         │  recording ◄─ player ────┼─► stepSim(runtime, state) ──► SimState
                         │  snapshots (every N ticks), timeline markers, divergences  │
                         └───────┬────────────────────────────┬───────────────────────┘
                                 │ SimView (read-only)        │ SimEvent[] (drainEvents)
             ┌───────────────────┼──────────────┐     ┌───────┴────────┬─────────────┐
             ▼                   ▼              ▼     ▼                ▼             ▼
   rendering (interpolate   UI timeline     HUD     audio            VFX         analytics
   prev→current by alpha)   getTimeline()                         (one-shot)
                            getSnapshotAt()
```

Nothing on the bottom row writes to the simulation.

## Simulation summary

* 60 Hz fixed step, integer units (1 tile = 1000), axes match Three.js (x east, y up, z south).
* Tick order: inputs → interactions (actors in order) → movement (actors in order) → entity update (ids in
  order) → carry (riders follow their deck/lift in the same tick) → signal swap → win check → tick++. See
  contracts §6.
* Actors: echoes first (by index), then the player. Earlier actors win same-tick contests. There is no
  actor-actor collision.
* Crates follow a **carry** model (E to pick up or drop, cell-snapped). Ramps and elevators change height
  levels. Ledges cannot be climbed or stepped off.
* Echoes replay **inputs**. A changed outcome becomes a `divergence` event and a timeline marker, and the
  echo continues.
* Snapshots are cached every 30 ticks for scrubbing and recomputed by re-simulation after any loop edit.
* World hash: FNV-1a over canonical state, computed per tick in tests.

## Determinism rules

See contracts §13. In short: integers only, a seeded RNG stored in the state, stable ids and orders, no
wall-clock or `Math.random`, no render/audio feedback, and a fixed timestep. A static lint test fails the
build if forbidden APIs appear in simulation code.

## Event list

`footstep, pickup, drop, interact, interactFailed, divergence, echoFinished, plateDown, plateUp, doorOpen,
doorClose, doorBlocked, switchOn, switchOff, switchTick, cellInserted, cellRemoved, elevatorStart,
elevatorArrive, elevatorHeld, laserOn, laserOff, receiverLit, receiverUnlit, gateOpen, gateClose, gateBlocked, platformDepart,
platformArrive, portalActivated, portalDeactivated, entity, levelLoaded, recordStart, rewind, echoSpawned,
echoLimitReached, loopDeleted, chamberRestart, loopTimeUp, levelComplete`

## Testing

* `npm test`: Vitest unit, integration and determinism tests (`src/**/*.test.ts`).
* `npm run test:e2e`: Playwright (builds, serves on :4173, uses preinstalled Chromium at
  `/opt/pw-browsers/chromium-1194`). Never run `playwright install`.
* The harness (`src/testing/harness`) provides `createGame`, `playScript`, `playInputs`, `runScripts`,
  `runSolution`, `compileSolution`, `replayLoops`, `verifyLevelSolution`, `firstHashMismatch`, plus the
  `inputs()` builder and `S.*` script shorthands. Fixtures: `openRoom`, `crateRoom`, `terrainRoom`.
* Every campaign level must be added to `CAMPAIGN_LEVELS` in `src/levels/definitions/index.ts`.
  `src/levels/levels.test.ts` then validates it and verifies its solution automatically.

## Debug hook

`window.__RECURSION__ = { game, loadLevel, dispose }` is set by `bootstrap()` for Playwright and devtools.
Treat it as read-only except for `loadLevel`.
`runSolution()` uses the lazily loaded solution compiler (`src/app/solutions.ts`, fetched after the menu paints): it
returns synchronously once `solutionsReady()`, otherwise a Promise (`page.evaluate` awaits it); `loadSolutions()`
preloads it. The app never imports `src/testing/harness` statically (round 4, load path).

## Tooling notes

* `.npmrc` sets `legacy-peer-deps=true`, because npm 10.9 crashes in the arborist (`edgesOut`) when it
  resolves vitest 4 peers.
