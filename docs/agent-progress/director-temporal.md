# Progress — Game Director + Temporal Systems Engineer (Agents 1 & 2)

## Completed
1. **Scaffold:** `package.json` (scripts: dev, build, preview, typecheck, test, test:watch, test:e2e), strict
   TS (`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, …), Vite 7, Vitest 4,
   Playwright 1.56.1 (matches the preinstalled chromium-1194), three 0.186, `.gitignore`, and `.npmrc`
   (`legacy-peer-deps=true`, a workaround for an npm arborist crash). The full directory layout from the
   brief exists (`.gitkeep` in empty dirs). `index.html` has `#app` and `#ui`.
2. **Contracts:** `src/engine/contracts/*` (numeric, input, temporal, entities, geometry, signals, events,
   state, level, behaviour, game), documented in `docs/architecture/contracts.md`.
3. **Engine:**
   - `simulation/`: `stepSim` with the documented tick order, the central interaction/ownership system,
     `EntityRegistry`, `LevelRuntimeImpl` (tile parsing, wiring), mulberry32 RNG, FNV-1a hashing,
     `hashState`, `deepClone`, `FixedStepper`.
   - `physics/`: terrain surfaces (floors, ramps, entity overrides) and integer axis-separated collision
     with step tolerance, solid entities, and `isSolidFor` per-actor filtering.
   - `temporal/`: `TemporalGame` (record, commit/rewind, echoes replaying inputs, echo limit,
     resetLoop/restart/deleteLoop/setLoops, divergence detection, a snapshot cache every N ticks
     invalidated on every edit, preview beyond the current tick, timeline) and an RLE loop codec.
   - `input/`: `InputSampler` (latched presses, camera-yaw rotation) and `KeyboardInput` (DOM → PlayerInput
     plus GameCommands).
4. **Gameplay reference entities** (`src/gameplay/entities`): pressurePlate, door (never closes on an
   occupant), crate (carry model), exitPortal, all registered through `createDefaultRegistry()`.
5. **Harness** (`src/testing/harness`): `ScriptRunner` (closed-loop InputScript), the `inputs()` builder,
   `S.*` shorthands, `createGame/playScript/playInputs/runScripts/runSolution/compileSolution/replayLoops/verifyLevelSolution/firstHashMismatch`,
   and fixtures `openRoom/crateRoom/terrainRoom`.
6. **Test level** `src/levels/definitions/test-chamber.ts`: one echo holds the plate, and the player goes
   through the door and up the ramp to a raised exit. The solution passes, and solving it solo is proven
   impossible.
7. **Tests (41):** determinism (3 identical runs, re-simulation, rewind and replay), 3 echoes retracing
   their recordings exactly, divergence on a stolen crate (echo continues and ends where its recording
   ended), echo-wins-contest ordering, snapshot equivalence (several intervals), preview, loop deletion and
   invalidation, echo limit, time-up, codec round trip, collision/ramps/ledges/doors, pickup/drop/failure,
   input latching, stepper, a static determinism lint, level validation and verification, registry
   extensibility, and a 3000-tick fuzz soak.
8. **App:** `src/main.ts` → `src/app/bootstrap.ts` (game loop, keyboard commands, minimal HUD, and a
   `window.__RECURSION__` debug hook) plus `src/app/bootView.ts` (an interim Three.js scene with ACES,
   shadows, a gold player, translucent cyan echoes, and animated plate/door/portal).
9. **Docs:** `docs/architecture/overview.md` (module map, ownership table, data flow, determinism rules,
   event list) and `docs/architecture/contracts.md`.

## Tests run (actual results)
- `npx tsc --noEmit`: clean.
- `npm test`: 6 files, **41/41 passed**.
- `npm run build`: success (JS bundle 567 kB, 147 kB gzipped).
- `npx playwright test`: **1/1 passed** (boot, move, rewind → echo count 1, no page errors).

## Design decisions others must know
- Units: 1 tile = 1000, 1 height level = 1000, axes = Three.js (x east, y up, z south). Render scale: 1 tile
  = 2 m (`unitsToWorld`).
- Processing order: echoes by index, then the player. Same-tick contests go to the older echo. There is no
  actor-actor collision.
- Crates use **carry**, not push. Drops are cell-snapped to the faced cell and fail when blocked or
  overlapping an actor.
- Signals are double-buffered (1 tick of latency per hop).
- Echoes idle in place after their loop ends (they keep pressing plates and holding items).
- At `loopDurationTicks` the pass becomes `timeUp`. The interim app auto-commits (or resets the loop if the
  echo limit is reached).
- `LevelDefinition.solution` is `InputScript[]` (closed-loop scripts), not raw TemporalLoops. Use
  `compileSolution(level)` to get TemporalLoops.

## Outstanding issues / caveats
- `getState()` returns the live state typed `DeepReadonly` (zero-copy). Consumers that need to keep a state
  must copy it.
- Ramps can be stepped off sideways from their high part (the "already-overlapping" rule). Level designers
  should flank ramps with railings or walls, as the test chamber does.
- `BootView` is interim and should be replaced by the graphics renderer. The HUD is a placeholder for the UI
  team.
- The bundle exceeds 500 kB because Three.js is not split. Graphics/director may add `manualChunks` later.
- Nested loops (Level 8) are not yet designed into the engine. They need a deliberate contract extension.

## Dependencies / handoffs
- **Gameplay:** implement timedSwitch, energyCell, energySocket, elevator, laserEmitter, laserReceiver,
  temporalGate, movingPlatform using the hooks (`surfaceCells`, `carrierDelta`, `acceptItem`,
  `giveItemToActor`, `isSolidFor`, `blocksLaser`). Polish the four reference entities. No engine edits are
  needed.
- **Levels:** add L01–L10 to `CAMPAIGN_LEVELS`. `levels.test.ts` verifies each one automatically.
- **Graphics:** consume `SimView` plus `getPreviousState()` and `FixedStepper.alpha`. Swap `BootView` in
  `bootstrap.ts` (coordinate with the director).
- **UI:** `getTimeline()`, `getSnapshotAt()`, `deleteLoop()`, `GameCommand`s, and the events.
- **Audio:** `drainEvents()` once per frame (the app should fan them out; currently the HUD reads them).
- **Persistence:** `encodeLoop`/`decodeLoop` plus `setLoops`.

## Next tasks
- Add an event bus in `app/` that fans `drainEvents()` out to audio, VFX and UI subscribers.
- Add a level-flow state machine (menu → intro → play → complete → next) in `app/`.
- Design nested-loop semantics for Level 8 with the level designer.
- Add a perf benchmark in `src/testing/benchmarks` with many entities once all kinds exist.
