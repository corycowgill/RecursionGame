# RECURSION — Shared Contracts (v1)

The source of truth is `src/engine/contracts/*.ts` (import everything from `src/engine/contracts`). This
document explains the rules behind those types. **Changing a contract:** make the smallest *additive* change
(new optional field, new event member, new optional behaviour hook), never repurpose an existing field, and
note the change in your progress report. Changing any value in `PHYS` or tick order invalidates every
existing recording and solution, so treat those changes as versioned.

| File | Contents |
|---|---|
| `numeric.ts` | Fixed-point units, axes, `Dir4`/`Dir8`, `idiv`, `cellOf`, `unitsToWorld` |
| `input.ts` | `PlayerInput`, `IDLE_INPUT`, `sanitizeInput`, `GameCommand` |
| `temporal.ts` | `ActorId`, `TemporalLoop`, `RecordedInteraction`, `InteractionKind`, `DivergenceRecord` |
| `entities.ts` | `EntityId`, `ENTITY_KINDS` (12), per-kind `*Config` / `*State`, `SimEntity`, `EntityDefinition` |
| `geometry.ts` | `TileKind`, `Tile`, `TILE_LEGEND`, `DecorDefinition` |
| `signals.ts` | `Wire`, `SignalId`, double-buffer semantics |
| `events.ts` | `SimEvent` union, `TIMELINE_EVENT_TYPES` |
| `state.ts` | `PHYS` constants, `ActorState`, `SimState`, `DeepReadonly`, `SimView` |
| `level.ts` | `LevelDefinition`, `InputScript` / `ScriptStep`, `CameraHints`, `LevelHint` |
| `behaviour.ts` | `PuzzleEntityBehaviour`, `SimContext`, `EntityContext`, `InteractContext`, `LevelRuntime` |
| `game.ts` | `TemporalGameApi`, `Timeline`, `TimelineTrack`, `TimelineMarker`, `StepResult` |

## 1. Numbers, space and time

* All simulation values are **integers**. 1 tile = `UNITS_PER_TILE` = 1000 units, and 1 height level = 1000
  units. Divide only with `idiv` (truncates) or `fdiv` (floors, used for cell lookup).
* Axes match Three.js: **x = east, y = up, z = south**. Cell `(col,row)` covers x∈[col·1000, col·1000+1000)
  and z∈[row·1000, …). Renderers convert with `unitsToWorld(u)`, where 1 tile = `WORLD_METRES_PER_TILE` = 2 m.
* Time is measured in **ticks at 60 Hz** (`SIM_HZ`). Seconds exist only on the render/UI side
  (`ticksToSeconds`).
* `SimState` holds only integers, booleans, strings, null, and plain arrays/objects
  (`assertPlainIntegerData` checks this).

## 2. Input

`PlayerInput { tick, moveX, moveY, interactPressed, interactHeld, actionPressed }`

* `moveX`/`moveY` ∈ {-1,0,1} in **world axes** (moveY = z; −1 = north). The browser layer
  (`KeyboardInput` → `InputSampler`) turns WASD into world axes using the camera yaw *before* recording, so
  recordings do not depend on the camera.
* `interactPressed`/`actionPressed` are true for exactly one tick per press. Presses are latched between
  ticks. `interactHeld` is level-triggered (a press implies held).
* Meta keys (R, Shift+R, Tab, Esc, Q, 1–5) become `GameCommand`s. They are never recorded.

## 3. Actors and loops

* `ActorId` = `'player'` | `` `echo:${loopId}` `` (nested-loop copies: `` `echo:${loopId}.${k}` ``, see §8b). `loopId` is stable and never reused. `echoIndex` (0-based,
  shown as "Echo 1…N") changes when a loop is deleted.
* `SimState.actors` order is the **processing order**: echoes by `echoIndex` ascending, then the player last.
  Older recordings act first in every phase, so the live player is the one who adapts. When the same tick is
  contested, the earlier actor wins.
* `TemporalLoop { id, durationTicks, inputs[], outcomes[] }`. `inputs` is dense (`inputs[t]` applies on tick
  t). Echoes replay **inputs from tick 0**, not positions. After `durationTicks` an echo idles in place
  (`finished = true`). It still presses plates and still holds what it carries.
* Actors **do not collide with each other**. This is deliberate: it keeps replays robust, so a body can never
  push an echo off its recorded path.

## 4. World state and the read-only view

`SimState { tick, status: 'playing'|'complete'|'timeUp', completedAtTick, rng, actors[], entities: Record<EntityId, SimEntity>, signals: Record<EntityId, boolean> }`

* `tick` = ticks simulated so far, so the next step simulates tick `tick`.
* Static data (tiles, entity configs, wires) lives in the immutable `LevelRuntime`, not in the state.
* Entities are never created or destroyed at runtime; behaviours use state flags instead. Iterate entities
  with `runtime.entityOrder`, which is sorted by code unit. Never rely on `Object.keys` order.
* Renderers, UI and audio receive `SimView = DeepReadonly<SimState>`. They **must not** mutate it or cast it
  back. `getState()` returns the *live* object (zero-copy), which changes on the next tick. If you need to
  keep it, copy it or use `getSnapshotAt` (which returns a fresh copy).

## 5. Entities

`ENTITY_KINDS`: pressurePlate, door, timedSwitch, crate, energyCell, energySocket, elevator, laserEmitter,
laserReceiver, temporalGate, movingPlatform, exitPortal. Each kind has a typed `Config` (authored, static)
and a typed `State` (dynamic) in `entities.ts`. `SimEntity<K> { id, kind, x, y, z, carriedBy, state }`.

Static geometry uses `Tile { kind: floor|wall|pillar|railing|ramp|void, h, dir? }`, authored as strings with
`TILE_LEGEND` (`. # O = _ ^ > v <`) and an optional `heights` digit grid.

### PuzzleEntityBehaviour (gameplay code; registered, never imported by the engine)

```ts
interface PuzzleEntityBehaviour<K> {
  kind: K;
  reset(def, ctx): State;                 // initial state for each pass (load/rewind/restart/delete)
  initialOutput?(def, state): boolean;    // tick-0 signal value
  update?(ctx: EntityContext<K>): void;   // once per tick, entity id order
  serialize?(state): unknown;             // hash input (default: state)
  carriable?; canPickUp?(e, ctx);         // carry model
  plateWeight?;                           // weight on pressure plates when resting
  isSolid?(e, def); isSolidFor?(e, def, actor); blocksLaser?(e, def);
  surfaceCells?(e, def): {col,row,y}[];   // walk-surface overrides (elevators, platforms)
  carrierDelta?(e): {dx,dy,dz} | null;    // carries actors standing on its surface
  interact?(ctx): InteractionResult|null; // E while facing (null = not interactable, continue)
  acceptItem?(ctx): InteractionResult|null; // E while carrying ctx.item and facing
  action?(ctx): InteractionResult|null;   // Space while facing
}
```

Register a behaviour with `registry.register(behaviour)` (see `src/gameplay/entities/index.ts`).
`loadLevel` throws if a level uses a kind with no registered behaviour. Behaviours may **read** anything
through the context. They may only **mutate** their own entity, and may change ownership only through the
`InteractContext` helpers (`releaseItemTo`, `giveItemToActor`).

## 6. Tick order (exact, documented resolution order)

`stepSim(runtime, state, frames, sink)` in `src/engine/simulation/step.ts`:

0. If `status !== 'playing'`, do nothing.
1. **Inputs:** per actor, in array order. Echoes whose loop has run out are flagged `finished`
   (`echoFinished` event).
2. **Interactions:** per actor, in array order: E first, then Space. Each is resolved immediately, so later
   actors see the result. Echo outcomes are compared with the recording (see §8).
3. **Movement:** the collision world is built once. Then per actor, in array order: ride the carrier surface,
   walk X then Z, settle on the surface, and carried items follow the carrier.
4. **Entity update:** per entity, in ascending id order. `update(ctx)` reads previous-tick signals and writes
   the next buffer.
5. **Signal buffer swap.**
6. **Win check:** the exit portal's new output is true **and** the *player's* centre is on the exit cell
   (within the step tolerance). This sets `complete` and emits `levelComplete`. Echoes never complete a level.
7. `tick += 1`. If `tick >= loopDurationTicks`, then `status = 'timeUp'` (`loopTimeUp`).

## 7. Interaction and ownership

* **Carry model** (not pushing): E picks up a carriable entity on the faced cell. E again drops it,
  cell-snapped, on the faced cell. An actor carries at most one item, and an item has at most one carrier.
  `ActorState.carrying` and `SimEntity.carriedBy` always mirror each other.
* **Probe cell** = the cell containing `actor centre + facing × PHYS.REACH` (650). **Candidates** = uncarried
  entities anchored in the probe cell (id order), then those in the actor's own cell (id order), within one
  height level.
* **Empty-handed E:** for each candidate, try `interact`; else, if it is carriable and `canPickUp` allows it,
  pick it up. With no candidate the result is `none`.
* **Carrying E:** the first candidate whose `acceptItem` returns non-null wins (e.g. socket ← cell).
  Otherwise **drop**, which requires a flat walkable cell at the same height with no solid or carriable
  entity and no actor overlapping the item's footprint. If the drop is impossible the result is `fail`
  (`interactFailed` event).
* **Space:** the first candidate whose `action` returns non-null wins. Otherwise `none`, which is not a
  failure.
* `facing` (Dir4) changes on any non-zero move input, even when the move is blocked. On diagonals the facing
  is kept if it matches one of the two components, otherwise horizontal is preferred.

## 8. Divergence (paradox handling)

While the player records, every attempt (E or Space) stores a `RecordedInteraction` in the loop's `outcomes`.
On replay, the echo's attempt on the same tick and with the same verb is compared by `(kind, entityId)`. On a
mismatch the engine:
* emits `divergence { actorId, loopId, echoIndex, expected, actual }`,
* sets `actor.divergedAtTick` (first divergence) and increments `divergenceCount`,
* adds the divergence to the timeline track.

The echo then **keeps replaying its inputs**. The engine never teleports it or fabricates a result.

## 8b. Nested loops (`LevelDefinition.recursion`, Level 8+)

Additive, opt-in per level: `recursion?: { delayTicks: number; copies?: number /*1*/ }`. When set, every committed
loop is replayed by its echo **and** by `copies` *recursive copies*. Copy k replays the very same `inputs`
delayed by `k * delayTicks`: before that it stands idle on the spawn cell, after `offset + durationTicks` it is
`finished` and idles in place like any echo. Copies are ordinary echo actors in every respect (physical, they press
plates, carry, block lasers and are blocked by `allows:'player'` gates).

* **Single source of truth:** `replayTracks(level, loops)` in `src/engine/simulation/recursion.ts` expands loops into
  replay tracks. Both `createInitialState` (actor list) and `TemporalGame` (frames, expectations, timeline) use it.
  Without `recursion` it yields exactly one track per loop, so existing levels, recordings and hashes are unchanged
  (verified by the golden replays).
* **Actor order** (= processing order): `loop0, loop0.copy1, …, loop1, loop1.copy1, …, player`. Older recordings still
  act first; a copy acts right after the echo it repeats.
* **Identity:** copy ids are `recursiveEchoActorId(loopId, k)` = `'echo:<loopId>.<k>'` (still starts with `echo:`;
  never parse it). `ActorState.recursion = k` (absent on echoes and the player); `loopId` and `echoIndex` are those
  of the loop it repeats.
* **Divergence:** a copy is compared with the loop's recorded outcomes at its own local tick (`tick − offset`), so a
  copy that meets a world changed by its own echo diverges visibly (and keeps replaying inputs).
* **Timeline:** each copy gets its own `TimelineTrack` with `recursion = k` and `startTick = offset`; its `planned`
  markers are already shifted by `startTick`.
* **Echo budget:** copies are free. `echoesRemaining`, `maxEchoes` and `levelComplete.echoesUsed` count recordings
  (loops), not bodies. UI echo counts must filter `track.recursion === undefined`.

## 9. Signals and wiring

Each entity has one boolean output channel, keyed by its id. `LevelDefinition.wires: { from, to, invert? }[]`.
A consumer combines its inputs with `def.logic` (`'and'` by default, or `'or'`) via
`ctx.inputsPowered(id)`, which returns `null` when the entity is unwired. Buffers are **double-buffered**:
reads during tick t see the values written during t−1, so each hop adds 1 tick of latency, and evaluation is
order-independent and safe with cycles. Unwired defaults: doors keep their `startsOpen` state, and exit
portals are active.

### Component additions made for level design

* `TimedSwitchConfig.cooldownTicks?` (default 0): after a switch runs out it is locked for that many ticks
  (`TimedSwitchState.cooldown?` counts down, present only when configured). Presses meanwhile fail with reason
  `'cooldown'`. With `retrigger:false` this makes a switch's window a real timing resource (L05).

## 10. Events (`SimEvent`)

Events are read-only notifications for audio, VFX and UI. They are never fed back into the simulation, are
not hashed, and are suppressed during snapshot re-simulation. Every event has a `tick`.
* Actors: `footstep`, `pickup`, `drop`, `interact`, `interactFailed`, `divergence`, `echoFinished`
* Components: `plateDown/Up`, `doorOpen/Close/Blocked`, `switchOn/Off/Tick`, `cellInserted/Removed`,
  `elevatorStart/Arrive`, `laserOn/Off`, `receiverLit/Unlit`, `gateOpen/Close`,
  `platformDepart/Arrive`, `portalActivated/Deactivated`, and `entity` (a generic escape hatch)
* Chamber/temporal (emitted by TemporalGame): `levelLoaded`, `recordStart`, `rewind`, `echoSpawned`,
  `echoLimitReached`, `loopDeleted`, `chamberRestart`, `loopTimeUp`, `levelComplete`

Consume events through `game.step(input).events` (this tick only) or `game.drainEvents()` (everything since
the last drain, including meta events). The app should drain once per frame and fan the events out to
audio, VFX and UI.

## 11. LevelDefinition (JSON-able)

`id, order, name, subtitle?, story?[], grid { width, height, tiles[], heights?[] }, entities[], wires[],
playerSpawn { col,row,facing? }, exitId, maxEchoes, loopDurationTicks, parTimeSeconds, parEchoes?, hints[],
solution: InputScript[], camera?, decor?[], seed?, recursion? (nested loops, §8b), teaches?[]`

* **solution** is one `InputScript` per loop. Every script except the last is committed as an echo, in
  order. The last is the final player run and must reach the exit. Scripts are closed-loop (for example,
  `moveTo` steers using the live position) and compile to concrete `TemporalLoop`s with
  `compileSolution(level)`. `verifyLevelSolution(level)` is the machine-verifiable win check.
* `ScriptStep` ops: `moveTo{col,row,timeoutTicks?}`, `move{dx,dz,ticks}`, `face{dir}`, `wait{ticks}`,
  `waitUntil{tick}`, `interact`, `action`, `hold{ticks}`.
* `decor` is purely visual and is never read by the simulation.

## 12. Game API (`TemporalGame`, `src/engine/temporal/TemporalGame.ts`)

```ts
new TemporalGame(registry: EntityRegistry, opts?: { snapshotInterval?: number /*30*/, trackPrevious?: boolean /*true*/ })
loadLevel(level: LevelDefinition): void
readonly level: LevelDefinition
readonly echoesRemaining: number
step(input: PlayerInput): StepResult            // { events, advanced }
commitLoopAndRewind(): boolean                  // false if maxEchoes reached (echoLimitReached) or nothing recorded
resetLoop(): void                               // discard recording, keep echoes, rewind
restartChamber(): void                          // drop all echoes, rewind
deleteLoop(index: number): void                 // remaining echoes keep recordings; rewind
setLoops(loops: readonly TemporalLoop[]): void  // persistence/replays; rewind
getLoops(): readonly TemporalLoop[]
getRecording(): readonly PlayerInput[]
getState(): SimView                             // live, read-only
getPreviousState(): SimView                     // for render interpolation (FixedStepper.alpha)
getTimeline(): Timeline                         // tracks: echoes then player; planned/actual markers, divergences
getSnapshotAt(tick: number): SimView            // <= current: exact replay; > current: preview with idle player
hash(): number; hashOf(state: SimView): number  // FNV-1a over canonical state
drainEvents(): SimEvent[]
```

Every operation that changes the loop set starts a **new pass** from the deterministic tick-0 state, and
also clears the snapshot cache, the timeline markers, and the preview cache.
`FixedStepper(tickFn, maxStepsPerFrame=5)` provides `advance(dtMs)`, `alpha`, `paused` and `timeScale`.

## 13. Determinism rules (enforced by tests and the static lint in `simulation.test.ts`)

1. No `Math.random`, `Date`, `performance.now`, timers, `localeCompare`, or Three.js inside
   `src/engine/{contracts,simulation,temporal,physics}` or `src/gameplay`.
2. Integer math only, with `idiv`/`fdiv` for division. No floats are stored in the state.
3. Randomness comes only from `ctx.random()` / `ctx.randomInt()` (seeded mulberry32 in `SimState.rng`).
4. Iterate in a stable order: actors in array order, entities via `runtime.entityOrder`, wires sorted by
   `from`.
5. Nothing outside the engine writes gameplay state. Rendering, audio and UI never influence the simulation.
6. A fixed 60 Hz step. Render rate only decides how many ticks run, never what a tick computes.
7. Snapshots are derived caches. They are invalidated on every loop edit and recomputed by re-simulation.
