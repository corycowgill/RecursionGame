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
| `entities.ts` | `EntityId`, `CORE_ENTITY_KINDS` (12, frozen), `ENTITY_KINDS` (core + round-6 `checkValve`, `chronoRelay`), per-kind `*Config` / `*State`, `SimEntity`, `EntityDefinition` |
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

`CORE_ENTITY_KINDS` (frozen, the brief's 12): pressurePlate, door, timedSwitch, crate, energyCell, energySocket,
elevator, laserEmitter, laserReceiver, temporalGate, movingPlatform, exitPortal. `ENTITY_KINDS` = the core 12 followed by
the round-6 expansion kinds **appended** in order: `checkValve`, `chronoRelay` (never reorder or insert: append only).
L10 uses every core kind (campaign.test checks `CORE_ENTITY_KINDS`). Each kind has a typed `Config` (authored, static)
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
  surfaceCells?(e, def): {col,row,y,clip?}[]; // walk-surface overrides (elevators, platforms); clip = sub-cell extent
  carrierDelta?(e): {dx,dy,dz} | null;    // carries actors standing on its surface (carry phase, §6 step 4b)
  interact?(ctx): InteractionResult|null; // E while facing (null = not interactable, continue)
  acceptItem?(ctx): InteractionResult|null; // E while carrying ctx.item and facing
  action?(ctx): InteractionResult|null;   // Space while facing
}
```

### Physical safety rules for moving entities (round 2: QA-1 / QA-2 / QA-3)

Nothing that moves or closes may leave an actor floating over a pit or inside a solid. The chosen rules:

* **Moving platforms (QA-1): the deck's walk surface is exactly its real 1×1 extent.** While a deck straddles two
  cells it reports both, each with `SurfaceCell.clip` = the deck's extent `[x−500, x+500) × [z−500, z+500)`
  (additive optional field); the part of a cell outside every clip keeps the tile's own surface (void in a deck
  lane). `cellSurfaceAtPoint` and `isFlatCell` honour clips, so collision, settling, drops, rideSurface and the QA
  invariants all see the same extent. Consequences: an actor can step across the pit edge onto a deck only where
  the deck actually touches that edge (a deck that has pulled away is a pit edge: the actor stops flush); a rider
  cannot walk off the deck's real edge into the uncovered half of a straddled cell (the move stops at the last
  supported point, `keepSupported` in `physics/collision.ts`); and **a rider is carried in the same tick the deck
  moves** (§6 step 4b), so it can never be left behind on the uncovered half. Items cannot be dropped onto a cell
  whose centre the deck does not cover.
* **Temporal gates (QA-2): a gate never closes on an actor.** When its signal drops while any actor's footprint
  overlaps the gate cell (within one height level), the gate stays **open** (output stays true, no `gateClose`)
  and closes on the first tick the cell is clear. An occupant is always someone the open gate admitted, so the
  `allows` filter is unchanged. Same rule as doors (`doorBlocked`).
* **Elevators (QA-3): a lift never moves into a body.** The departure is held while anyone straddles the shaft
  edge (unchanged). During travel each step is clamped so the platform never rises more than `STEP_TOLERANCE`
  above the feet of an actor straddling the shaft (someone who stepped off a rising lift, or is stepping on), and
  never sinks a rider more than `STEP_TOLERANCE` below a neighbouring surface its footprint overhangs. When the
  clamp stops it the lift waits in place (`state.held = true`) and resumes as soon as the actor clears the edge or
  boards fully. Riders follow the platform height in the same tick (§6 step 4b).

### Round-6 expansion mechanics (no engine change; registry + existing hooks only)

All three go through the entity registry, the central interaction/ownership rules and the existing hooks; no tick-order,
`PHYS` or temporal-engine change. Their events are feedback only (never hashed, never read by the simulation). Their
state resets every pass like all state. The 10 original campaign goldens are byte-identical with the extended registry
(per-tick hashes; the integration later changed only their `levelFingerprint` lines, for the new `order` values).

**Check valve** (`checkValve`, `src/gameplay/entities/checkValve.ts`): a one-way ratchet doorway across one corridor
cell. `def.facing` = the direction of travel that may pass (downstream). `CheckValveConfig { reverseWhenPowered? }`:
with wired inputs the direction is reversed while the combined input is powered (previous buffer, 1 tick latency);
unwired or without the flag it never changes. `CheckValveState { dir: Dir4; phaseTicks /* saturates at 600 */ }`.
Output: always false (wires FROM a valve are a validation error).
* Solidity uses the existing `isSolidFor(entity, def, actor)` hook only. With (cx,cz) the cell centre, (ax,az) the actor
  centre and (ux,uz) the unit vector of `state.dir`: `along = (ax-cx)·ux + (az-cz)·uz`,
  `lateral = |(ax-cx)·uz - (az-cz)·ux|`; the valve is solid for the actor iff `along >= HALF_TILE` or
  `lateral >= HALF_TILE`. Because collision ignores blockers an actor already overlaps before a move (§ collision
  model), anyone whose footprint still touches the cell can move either way; a body commits only once its footprint
  fully leaves the downstream side. A flip mid-crossing therefore never traps or crushes anyone (no "held" exception
  needed), and carry moves (decks, lifts) use the same predicate, so nobody is ferried upstream.
* `isSolid` = true (item drops, resting crates, non-actor default): nothing can be dropped into the cell; carried items
  pass with their carrier. `blocksLaser` = false (grille). Not carriable, no interact/action/acceptItem. Players,
  echoes and nested-loop copies are treated identically (orthogonal to temporal gates); an echo replaying into the
  closed face just pushes and stays put (positional, never a divergence).
* Events: `entity {name:'valvePass', entityId, actorId}` when an actor's centre crosses the cell centre downstream;
  `entity {name:'valveDenied', entityId, actorId}` once per contact (an actor arriving flush against the closed face,
  derived from position and this tick's displacement, nothing stored); `entity {name:'valveFlip', entityId}`.
* QA: the 'solid' invariant skips valve boxes (an overlapping actor is always one the valve admitted); the stateful
  `InvariantChecker.checkValveCrossings()` (run every tick by the fuzzer) flags any actor that goes from not overlapping
  the cell, with its centre downstream or beside it, to overlapping it.

**Attuned devices / Paradox Glass** (optional config on `pressurePlate` and `timedSwitch`; absent fields keep the
original code path and the serialized state byte-identical). Actor classes: `'player'` = `actor.kind === 'player'`,
`'echoes'` = `actor.kind === 'echo'` (nested-loop copies included).
* `PressurePlateConfig.accepts?: 'all' | 'echoes' | 'player'` (default `'all'`): when not `'all'`, occupants = the
  matching actors on the cell only (others are ignored completely), crates/cells never count (`acceptsCrates` ignored),
  `threshold` counts matching bodies, `latch` works as before.
* `TimedSwitchConfig.accepts?`: a press by a non-matching actor returns `fail` with reason `'attuned'` before the
  cooldown / busy checks, with no state change. A live press on an Echo Console fails while recording and the same input
  succeeds on replay: the deterministic `fail -> use` divergence (recorded reason `'attuned'`), drawn violet on the
  timeline ("intended"). A recording that presses a Gold Console live fails on replay (`use -> fail`).
* `shatterOn?: 'echoes' | 'player'` on both kinds (must differ from `accepts`). State gains `broken: boolean` ONLY when
  `shatterOn` is configured (same optional-field pattern as `cooldown`). Plate: the first tick an actor of that class
  stands on it (`actorsOnCell`) it breaks: one `entity {name:'shatter', entityId, actorId}` naming the first such actor in
  actor-array order, then `pressed = false, occupants = 0, pressedTicks = 0`, output false for the rest of the pass
  (latch ignored). Switch: a press by that class returns `fail 'shattered'` and breaks it (`on = false,
  remainingTicks = 0`, shatter event); every later press fails `'shattered'`. Check order in a press: broken ->
  shatterOn -> accepts -> busy / cooldown. Breaking happens inside the device's own update / interact (own-entity rule).
* `'attuned'` and `'shattered'` are plain fail reasons; TemporalGame records and compares them like `'cooldown'`.

**Chrono relay**: see §9 "Chrono relay". Validation rules for all three: `src/levels/validators/mechanics.ts`.

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
3. **Movement:** the collision world is built once. Then per actor, in array order: walk X then Z, settle on
   the surface, and carried items follow the carrier. Then each actor's **carrier** is noted: the deck/lift whose
   (clipped) surface is under its centre, within `STEP_TOLERANCE` (first provider in id order covering the point).
4. **Entity update:** per entity, in ascending id order. `update(ctx)` reads previous-tick signals and writes
   the next buffer.
4b. **Carry** (round 2): per rider noted in step 3, in array order: move by the carrier's `carrierDelta` of *this*
   tick (collision-checked against walls, ledges and solids; the bare pit its footprint overhangs does not block a
   carry move), re-seat on the surface under the centre (lift height), carried items follow. Riders therefore never
   lag their carrier by a tick. (Before round 2 the ride happened at the start of step 3 with the previous tick's
   delta; the change re-blessed the L04/L05/L10 goldens — completion ticks unchanged except L04, one tick earlier.)
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

### Chrono relay (`chronoRelay`, round 6): a delayed signal ("Echo Line")

`ChronoRelayConfig { delayTicks /* integer, 30..900 */; initialOn? /* default false */ }`. Inputs are ordinary wires
into it, combined with `def.logic` (default `'and'`), per-wire `invert` as everywhere; its output may itself be wired
(inverted or not) to any consumer. `ChronoRelayState { out; last; pending: number[] /* countdowns, strictly ascending */ }`.
`reset` = `{ out: initialOn, last: initialOn, pending: [] }`, `initialOutput` = `initialOn`. `update`, in this order:
1. every countdown `-= 1`; then while `pending[0] === 0`: shift it and toggle `out`;
2. `c = inputsPowered(id) ?? false` (previous-tick buffer); if `c !== last`: push `delayTicks`, `last = c`;
3. `setOutput(out)`.

**Latency contract:** a source that changes on tick s is read by the relay on s+1, the relay toggles on s+1+delayTicks,
and its consumer reacts on s+2+delayTicks: exactly `delayTicks + 1` ticks more than through a direct wire. The whole
waveform is replayed (a 2 s press arrives as a 2 s pulse). `pending.length <= delayTicks` by construction (at most one
push per tick, each lives delayTicks ticks). Countdowns (not absolute ticks) make the state change every tick while a
pulse is in flight, so the solver's quiescence fingerprint stays correct. Integers and booleans only; `serialize` = state.
With `initialOn` and a source that is off at tick 0 the relay pushes on tick 0 and falls on tick `delayTicks`.
Body: not solid, no laser block, not carriable, no interaction; its anchor may be a wall/railing cell (exempt from the
"non-walkable tile" warning) or floor. Events (feedback only): `entity {name:'relayArm'}` on each push,
`entity {name:'relayEmit', value: 1|0}` on each output toggle. Validation: delay integer in [30, 900], at least one
input, warning when `delayTicks >= loopDurationTicks - 120`, error when the relay is wired (directly or through doors /
gates) back into its own input. The relay's state is also its input's recent history, which the timeline uses to draw
the input waveform, its delayed ghost and the planned arrival markers (`src/ui/timeline/devices.ts`).

### Component additions made for level design

* `TimedSwitchConfig.cooldownTicks?` (default 0): after a switch runs out it is locked for that many ticks
  (`TimedSwitchState.cooldown?` counts down, present only when configured). Presses meanwhile fail with reason
  `'cooldown'`. With `retrigger:false` this makes a switch's window a real timing resource (L05).

## 10. Events (`SimEvent`)

Events are read-only notifications for audio, VFX and UI. They are never fed back into the simulation, are
not hashed, and are suppressed during snapshot re-simulation. Every event has a `tick`.
* Actors: `footstep`, `pickup`, `drop`, `interact`, `interactFailed`, `divergence`, `echoFinished`
* Components: `plateDown/Up`, `doorOpen/Close/Blocked`, `switchOn/Off/Tick`, `cellInserted/Removed`,
  `elevatorStart/Arrive/Held`, `laserOn/Off`, `receiverLit/Unlit`, `gateOpen/Close/Blocked`,
  `platformDepart/Arrive`, `portalActivated/Deactivated`, and `entity` (a generic escape hatch)
* Round 4 (additive, feedback only): `gateBlocked` fires once when an occupant starts holding a closing temporal gate
  open (QA-2; mirrors `doorBlocked`); `elevatorHeld` fires once when a lift starts waiting in place (`state.held`
  false → true). The gate's edge detection uses the optional `TemporalGateState.held`, which
  `temporalGate.serialize` strips from the hash, so hashes and golden replays are unchanged.
* Round 6 (generic `entity` events, feedback only): `valvePass`, `valveDenied`, `valveFlip` (check valve), `relayArm`,
  `relayEmit` (chrono relay, `value` 1/0), `shatter` (Paradox Glass, `actorId` = the breaking actor). Optional visual
  hook: `EntityVisual.onEvent(ev, state)` receives every event naming that entity (routed by the renderer).
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
* Player-facing text (`name`, `subtitle`, `story`, `hints[].text`) never names a key. Controls are written as
  action tokens (`{interact}`, `{action}`, `{echo}`, `{restart}`, `{timeline}`, `{preview}`, `{pause}`, `{move}`)
  that the UI renders for the active device (`src/ui/actionText.ts`). `src/ui/actionText.test.ts` fails on a raw key
  reference or an unknown token. (Round 4, additive.)

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
