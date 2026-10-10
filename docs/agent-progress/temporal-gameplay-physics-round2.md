# Progress — Temporal/Gameplay physics engineer, round 2: QA-1 / QA-2 / QA-3

## Completed

All three open physics bugs are fixed at the root, deterministically. Their expected-fail repros are now normal
passing tests, each with edge-variant regression tests, and the fuzzer no longer tallies them as known issues:
any recurrence now fails the run.

### QA-1: rider left floating over the pit next to a moving deck (L05)

Root cause: while straddling two cells, `movingPlatform.surfaceCells` reported both whole cells as walkable. A
rider could stand on the half of a cell the deck didn't cover. Riders were carried only while their centre cell was
reported, so once the deck left that cell the rider stopped over the void, and `settleOnSurface` did nothing there.

Fix (rule: **the deck's walk surface is exactly its real 1x1 extent, and riders move with it in the same tick**):
- `SurfaceCell.clip` (additive, optional contract field): a straddling deck reports each cell clipped to
  `[x-500,x+500) x [z-500,z+500)`. A docked deck reports a plain full cell, so docked behaviour is unchanged.
- `physics/terrain.ts`: overrides are now a per-cell list of `{y, clip}`. `cellSurfaceAtPoint`, `isFlatCell` and the
  new `overrideAtPoint` honour clips, with the point clamped into the cell. The first override covering the point
  wins, and points outside every clip fall back to the tile (void). Collision, settling, drops, `rideSurface` and the
  QA invariants all read these same functions.
- `physics/collision.ts`: a walking move can't take the centre from a supported point to an unsupported one inside
  the same cell (`keepSupported`, integer bisection). A new `carry` move option means bare void cells don't block a
  rider being carried, but walls, ledges and solids still do.
- `simulation/step.ts`: a new **carry phase (tick step 4b)**. Riders are noted after movement, and after the entity
  update they move by their carrier's delta from this tick, then re-seat on the surface. This removes the old
  one-tick lag, in which riders moved at the start of the next tick's movement by the previous delta. That lag would
  otherwise let a trailing-edge rider sit outside the deck's real extent at the end of a tick.
- `gameplay/entities/common.ts`: `surfaceProviderAt` honours clips, so items ride only the deck they really sit on.

### QA-2: temporal gate closes on an actor

Rule: **a gate never closes on an actor.** If the signal drops while any actor's footprint overlaps the gate cell
(within one level), the gate stays open: output stays true and no `gateClose` fires. It closes on the first tick the
cell is clear. This works like doors, needs no new state field, and leaves the `allows` filter unchanged. File:
`src/gameplay/entities/temporalGate.ts`.

### QA-3: brief clip into a departing lift

Rule: **a lift never moves into a body.**
- The departure hold is unchanged.
- During travel, each step is clamped (`clampTravel`):
  - The platform never rises more than `STEP_TOLERANCE` above the feet of a non-rider whose footprint overlaps the
    shaft.
  - It never sinks a rider more than `STEP_TOLERANCE` below a neighbouring surface the rider's footprint overhangs.
    This variant was found while fixing QA-3: the fuzzer hadn't hit it, but it would have been an untallied `ledge`
    violation.
- When the clamp stops the lift, it waits in place (`state.held = true`) and resumes once the actor clears the edge
  or boards fully. Riders follow the lift height in the same tick through the carry phase.

File: `src/gameplay/entities/elevator.ts`.

All three rules are documented in `docs/architecture/contracts.md`, in the new subsection under §5 ("Physical safety
rules for moving entities") and §6 step 4b. The tick-order line in `docs/architecture/overview.md` is updated too.

## Golden replays: regenerated (justified)

`npm run replays:update` changed `L04-the-lift`, `L05-perfect-timing`, `L10-the-core` and the gauntlet fuzz
fingerprint (seed 7). These are exactly the content with lifts or decks. The cause is the intended removal of the
one-tick rider lag (step 4b): riders now reach their deck/lift position one tick earlier.
- L05 and L10: only mid-ride checkpoints changed. Completion ticks and final hashes are the same (L05 682, L10 1063).
- L04: completes one tick earlier (803 → 802), and its compiled loop durations drop by one tick (798 → 797,
  804 → 803).

No other level's goldens changed. The pre-change goldens are kept in the scratchpad for comparison.

## Files changed

- `src/engine/contracts/behaviour.ts`: additive `SurfaceCell.clip`; doc comments for the carry phase.
- `src/engine/physics/terrain.ts`: clipped override list, `overrideAtPoint`, `overrideCovers`.
- `src/engine/physics/collision.ts`: `keepSupported` support rule, `MoveOptions.carry`.
- `src/engine/simulation/step.ts`: `carrierUnder`, carry phase `carryRiders` (step 4b); the ride at the start of
  movement is removed.
- `src/gameplay/entities/movingPlatform.ts`, `elevator.ts`, `temporalGate.ts`, `common.ts`.
- `src/testing/qa/known-bugs.test.ts`: QA-1/2/3 flipped from `it.fails` to `it`, plus 14 edge-variant tests:
  - QA-1:
    - stepping onto a deck that has already pulled away;
    - a trailing-edge rider carried the whole way with zero lag every tick;
    - a rider walking toward the trailing edge stops at the real edge;
    - the same along z;
    - no drop onto the uncovered half.
  - QA-2:
    - held open while occupied, closes on leaving, then blocks;
    - a straddling footprint holds it;
    - an echo holds it on replay.
  - QA-3:
    - waits at feet + 300, then resumes;
    - boarding back carries on;
    - a descending lift never sinks a rider into the upper floor it overhangs.
- `src/testing/qa/fuzz.test.ts`: `knownIssue()` no longer whitelists anything.
- `src/engine/physics/physics.test.ts`: unit test for clipped overrides.
- `src/testing/replays/{L04,L05,L10}*.golden.json`, `fuzz-fingerprints.golden.json`: re-blessed (see above).
- `docs/architecture/contracts.md`, `docs/architecture/overview.md`, this report.

## Tests run (real results)

- Repros before the fix (temporarily run as `it`): QA-1 29 `platform` violations, QA-2 93 `solid`, QA-3 4 `ledge`.
- `npx vitest run src/testing/qa/known-bugs.test.ts`: 17 passed.
- `FUZZ_TICKS=20000 FUZZ_SEEDS=4 npx vitest run src/testing/qa/fuzz.test.ts`: **63 passed**, nothing tallied as known
  and no invariant violations, on every campaign level, the test chamber, the fixtures and the 12-component gauntlet.
- `npm run verify`: typecheck clean; **25 files, 421 passed, 0 expected-fail**; build OK. This includes
  `src/levels` (all 10 solutions complete within their echo limits) and the golden replays.

## Outstanding / notes for others

- QA docs (`docs/agent-progress/qa.md`) and the release notes still list QA-1/2/3 as open. Those are owned by QA
  and the director.
- Renderer: a held lift (`state.held`) can now pause mid-shaft. Showing that visually is optional.
- The temporal gate has no "blocked" event. If audio wants a cue, an additive `gateBlocked` event could mirror
  `doorBlocked`.
