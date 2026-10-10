# Progress: Gameplay / Puzzle Engineer + Level Designer (Agent 3)

## Completed

### 1. All 12 puzzle components (`src/gameplay/entities/`)
Each component is one file, registered through `registerCoreEntities()` / `createDefaultRegistry()`. They need no engine edits. `CORE_BEHAVIOURS` lists all 12. All state is integers or booleans, behaviours iterate in id order, and each one mutates only its own entity. Ownership changes go only through `giveItemToActor` / `releaseItemTo`.

| Kind | Rules (full doc comment in each file) |
|---|---|
| pressurePlate | Pressed while (actors on the cell + resting `plateWeight`) >= `threshold`. Supports `acceptsCrates:false` and `latch`. Crates weigh 1, energy cells weigh 0. Output: pressed. |
| door | Opens while powered (`startsOpen` inverts this; unwired doors keep their initial state). Solid while progress < 800. **Deterministic blocking:** a door never closes while an actor footprint or a carriable item overlaps its cell. Progress freezes, `blocked=true`, and one `doorBlocked` event fires. |
| timedSwitch | A solid console. E or Space turns it on, and its output stays true for exactly `durationTicks` updates. With `retrigger` (the default) a press restarts the timer. With `retrigger:false` a press while on fails with `busy`, so a replay that meets a different switch state shows up as a divergence. Events: `switchOn`, `switchTick` each second, `switchOff`. |
| crate | Carried, not pushed. Solid, blocks lasers, weight 1. **Rides elevators and moving platforms** it rests on. |
| energyCell | Carriable, not solid, weight 0, does not block lasers. It cannot be picked up while seated (the socket handles extraction). `socketId` is mirrored for renderers. Output: seated. |
| energySocket | A solid pedestal. Carrying a cell + E gives `insert` (fails with `occupied` or `rejected` on a tag mismatch). Empty-handed E gives `extract` (fails with `locked` when `allowExtract:false`). Supports `initialCell`. Output: powered. Outcomes record the socket id. |
| elevator | A one-cell walk-surface override on a void shaft. Modes: `signal` (powered = top level), `cycle` (E advances; fails with `busy` while moving), and **`ride`** (new: stand on it for `rideDelayTicks` and it travels, then re-arms once vacated). In cycle/ride mode a wired input acts as a call button on its rising edge. `returnDelayTicks` sends an empty platform home. **Departure is held while an actor straddles the shaft edge.** Speed is ceil(1000/ticksPerLevel). Output: at rest on the top level. |
| laserEmitter | Exported `traceBeam`: a grid raycast at waist height (+500). Walls, pillars and raised terrain stop the beam; railings and void do not. A receiver terminates the beam. Entities with `blocksLaser` (crates, closed doors, devices) block it. Actors block at their near face. Results go into `beamLength / hitEntityId / hitActorId`. Unwired emitters are on unless `startsOn:false`. |
| laserReceiver | Lit while any emitter's beam ends on it (from any side). Latency is 0 or 1 tick depending on id order, deterministically. Output: lit. |
| temporalGate | **Filters by timeline:** `echoes` lets only echoes pass (record walking into it, and your echo gets through), `player` lets only the live player pass, `all` lets everyone pass. When wired, the gate is open only while powered, and blocks everyone while closed. Items pass with their carrier but cannot be dropped into the field. Lasers pass through. Output: open. |
| movingPlatform | Path waypoints, speed, pause at every waypoint (including tick 0), `pingpong` or `loop` mode. When wired it moves only while powered. The surface covers every cell the 1x1 deck overlaps, so riders are never dropped mid-crossing. Riders are carried via `carrierDelta`, and resting items ride too. Output: docked. |
| exitPortal | Active when all wired conditions hold (`and` or `or` logic), or always when unwired. Only the player completes the level. |

### 2. Player controller support
- Movement feel, facing and the interaction probe are the engine's (immediate 40 u/tick, facing changes even when blocked, probe = centre + 650 along the facing).
- `src/gameplay/player/animation.ts`: `actorAnimState(view, actor)` / `allActorAnimStates(view)` derive one read-only record per actor: `locomotion: idle|walk|ride`, `moving`, `speed`, `facing`, `heading`, `carrying`, `carryKind`, `interacting` (14-tick pose window), `interactKind`, `ticksSinceInteract`, `interactFailed` (24-tick flinch), `holding`, `finished`, `diverged`. This is for graphics and audio.
- `src/gameplay/interactions/targeting.ts`: `predictInteraction(level, view, actorId?)` mirrors the central targeting rules and returns `{action: pickup|drop|insert|extract|use|blocked|none, entityId, entityKind, label, cell}`, for example "Pick up crate" or "Can't place crate here". It is for UI prompts and target outlines, it is read-only, and a test checks that each prediction comes true.

### 3. Puzzle completion and progression
- `src/gameplay/puzzles/objectives.ts`: `getObjectiveStatus(level, view)` and `consumerStatus(level, view, id)` report per-condition satisfied flags for any wired door, portal or gate (for indicator lights and the objective panel).
- `src/gameplay/puzzles/completion.ts`: `evaluateCompletion(level, ticks, echoes)` and `completionFromEvents(level, drainedEvents)` give a 1–3 star rating: 1 for completing, 2 for staying within `parEchoes`, 3 for also finishing the final run within `parTimeSeconds`.
- `src/levels/progression.ts`: `CampaignProgress` (plain JSON, versioned), `recordCompletion` (immutable, keeps the best results), and `Campaign` (`next`, `isUnlocked`, `unlocked`, `continueLevel`, `totalStars`). The first level is always unlocked, and each later level unlocks once the previous one is completed.
- `src/levels/index.ts` exports `LEVELS` (ordered), `CAMPAIGN`, `VERTICAL_SLICE_LEVEL`, `CAMPAIGN_LEVELS`, `TEST_LEVELS`, progression and `validateLevel`. `src/gameplay/index.ts` is the gameplay barrel.

### 4. Levels 1–3 (`src/levels/definitions/L0*.ts`), registered in `CAMPAIGN_LEVELS`
Each level has an ASCII map in its doc comment, story, subtitle, three or four timed hints, echo limit, par time and echoes, camera focus and intro path, decor, and a machine-verified solution.
- **L01 First Echo**: a pillared nave over the abyss. The sanctum door answers to a plate on a far east balcony. Echo limit 2, par 1 echo / 12 s. The solution completes at tick 285.
- **L02 Two Places at Once**: two doors in series. Plate B sits at the end of a bridge that is reachable only through door A, so two echoes must act at the same time. Limit 3, par 2 / 14 s. Completes at tick 482.
- **L03 The Relay, the VERTICAL SLICE**: three cooperating loops, a movable crate, two pressure plates, a timed door and the exit. The Chrono Door is wired as AND(crate plate, watch plate, 4 s timed switch). The switch is on a balcony across the abyss, about 9 s from the door and from both plates. Loop 1 puts the crate on one plate and stands on the other, loop 2 presses the switch, and loop 3 is you walking through. maxEchoes = 2, so the crate is essential. Completes at tick 585.

### 5. Validator
`validateLevel` now also checks: a socket's `initialCell` is placed on the socket's cell, platform `path[0]` equals the platform's cell and path segments are not diagonal, elevator levels ascend and match the start level, unwired doors / signal elevators / gates, timed-switch duration, emitter facing, solid devices on the spawn, carriables starting on void, and campaign text (subtitle, story, hints, parEchoes <= maxEchoes). All three levels validate with **zero errors and zero warnings**.

## Files changed
- **New:** `src/gameplay/entities/{common,timedSwitch,energyCell,energySocket,elevator,laser,temporalGate,movingPlatform}.ts`, `src/gameplay/entities/entities.test.ts`, `src/gameplay/index.ts`, `src/gameplay/interactions/targeting.ts`, `src/gameplay/player/{animation.ts,player.test.ts}`, `src/gameplay/puzzles/{objectives,completion}.ts`, `src/levels/definitions/{L01-first-echo,L02-two-places,L03-the-relay}.ts`, `src/levels/{index,progression,campaign.test}.ts`, and this report.
- **Modified:** `src/gameplay/entities/{crate,index}.ts`, `src/levels/definitions/index.ts`, `src/levels/validators/validateLevel.ts`.
- **Contract (additive only):** `src/engine/contracts/entities.ts`. `ElevatorConfig.mode` gains `'ride'`, plus optional `rideDelayTicks` and `returnDelayTicks`. `ElevatorState` gains optional `dwellTicks`, `armed`, `lastInput` and `held`. No existing field changed, `PHYS` and tick order are untouched, and every existing recording stays valid.

## Tests run (actual results)
- `npx vitest run`: **9 files, 108/108 passed**. That is the director's 41 plus my 67: components 32, player/targeting/objectives 7, campaign 28.
  - Components: each of the 12 kinds, including blocking, timers, tags, ride / cycle / signal elevators and the straddle hold, laser blocking by actors / crates / walls, gate timeline filtering with a real echo, platform carry and determinism, and items riding decks.
  - Campaign, per level: the solution completes within the echo limit with no divergences; per-tick hashes are identical across runs and in pure `replayLoops` re-simulation; the final run alone fails; each solution loop played solo, followed by the final script, fails; the known solution earns 3 stars.
  - Fewer-echo checks: L1 tap-and-run fails. L2 fails with one echo, tried two ways. L3 fails with two loops tried three ways (player presses the switch; one echo does everything in sequence; bodies on both plates without the crate). L3 also checks the timed door closes exactly 240 ticks after opening, and that progression unlocks in order.
- `npx tsc --noEmit`: **clean for every file I own.** The only errors are 2 unused-variable errors in the graphics agent's in-progress files (`src/graphics/animation/actorVisual.ts`, `src/graphics/environment/kit.ts`).
- **Playwright (`tests/e2e/smoke.spec.ts`): now FAILS at line 9.** I built with Vite into my scratchpad and served on a private port, because `npm run build` runs tsc, which fails on the graphics errors. `bootstrap.ts` boots `CAMPAIGN_LEVELS[0]`, which is now **First Echo**, so the hardcoded `toContainText('Test Chamber')` no longer matches. A scratch copy with only that string changed to `'First Echo'` **passes** (boot, move, R makes 1 echo, no page errors). I did not edit `tests/e2e` because I don't own it.

## Outstanding issues / caveats
- **Director/QA:** update the smoke assertion (for example to `/First Echo|Test Chamber/`), or add a `?level=` boot option.
- Moving platforms: because the deck's surface covers both cells it straddles, someone stepping onto the not-yet-covered part of a straddled cell mid-transit can be left "floating" when the deck finishes leaving that cell. It is deterministic and you can walk off it. A clean fix needs an engine-side sub-cell surface rectangle (`surfaceRects`), so I'm suggesting it to the temporal engineer. Levels 1–3 do not use platforms.
- Crates riding a deck may lag the deck by one tick when the deck's id sorts after the crate's. The total displacement is exact.
- Laser receivers have 0 or 1 tick of latency depending on id order.
- A rising-edge call to an elevator that arrives while it is moving is ignored (documented).
- `predictInteraction` is advisory UI only. It can be wrong only in same-tick contests, and the engine stays the authority.
- Doorway blocking is a legitimate emergent trick: a body standing in a door keeps it open. All three levels were checked to make sure it does not reduce their minimum echo count.

## Dependencies / handoffs
- **Graphics:** read `actorAnimState`, `traceBeam`/`beamEnd` (or the emitter state), `ElevatorState.y/held`, `MovingPlatform` entity x/z, `DoorState.blocked`, `TemporalGateState.phaseTicks`, and `CrateState.restTicks`. Decor vocabulary used in the levels: `observationWindow{width}`, `ring{scale,clockwork}`, `archway{indicators}`, `conduit{to,color,span}`, `lamp`, `machinery{variant: gears|pistons|clockwork}`, `hologram{text,color}`, `abyssLight{color}`. Conduits name their target entity in `params.to`.
- **UI:** `predictInteraction` for the E prompt, `getObjectiveStatus`/`consumerStatus` for condition lights, `completionFromEvents` for the results screen, and `CAMPAIGN` plus `recordCompletion` for level select and unlocks. Level `hints[].afterSeconds` drives hint timing.
- **Audio:** component events are all typed (`switchTick` once per second for the countdown, `doorBlocked`, `elevatorStart/Arrive`, `laserOn/Off`, `gateOpen/Close`, `platformDepart/Arrive`, `cellInserted/Removed`).
- **Persistence:** `CampaignProgress` is plain versioned JSON.
- **Director:** `docs/architecture/contracts.md` §5 could mention elevator `'ride'` mode (the contract comments already document it).

## Next tasks
- Levels 4–10 per the brief: 4 The Lift (ride/cycle elevators), 5 Perfect Timing (timed switches + platforms), 6 Chain Reaction (lasers + sockets), 7 Broken Sequence (gates / `retrigger:false` divergence), 8 Recursive Machine (needs a nested-loop contract), 9 Paradox Chamber, 10 The Core.
- A bounded brute-force "minimum echoes" search tool in `src/testing` to prove echo minimums beyond the hand-written negative scripts.
- Offer `surfaceRects` to the temporal engineer for platform sub-cell surfaces.
