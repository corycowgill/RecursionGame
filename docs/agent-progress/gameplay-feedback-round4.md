# Gameplay feedback engineer: round 4 report

Date: 2026-10-11 · Branch: `claude/recursion-game` (not committed; the director handles git)

This round closes v0.2 known issues 3 (head look), 4 (held lift / held gate feedback) and 7 (the colour-blind palette
did not reach 3D). It also adds a character turntable to the graphics preview.

## What was done

### 1. New SimEvents: `gateBlocked` and `elevatorHeld` (not hashed, goldens unchanged)
- `src/engine/contracts/events.ts` (additive):
  - `gateBlocked { entityId }`: a temporal gate wants to close (its signal dropped), but an actor overlaps its cell, so it stays open (QA-2). It mirrors `doorBlocked` and fires once, when the hold starts.
  - `elevatorHeld { entityId, y }`: a lift starts waiting in place (`state.held` goes false → true, at departure or mid-travel, QA-3). The brief only asked for a lift-held *audio* cue. This event gives the cue a trigger, using the same pattern.
- `src/gameplay/entities/temporalGate.ts`: emits `gateBlocked` on the first tick of a hold. To find that edge, the gate keeps an **optional** `TemporalGateState.held` flag. This is a minimal additive contract field in `src/engine/contracts/entities.ts`.
  - The flag is absent until the first hold, then true or false.
  - A new `serialize` hook hashes exactly the old shape `{ open, phaseTicks }`, so the flag is never hashed.
  - No gameplay decision reads it. `open`, the output and the `allows` filter are untouched.
- `src/gameplay/entities/elevator.ts`: emits `elevatorHeld` on the held edge (`wasHeld` is captured at the top of `update`). There are no other changes.
- Docs: the event lists in `docs/architecture/contracts.md` §10 and `overview.md` (shared files, additive).

**Golden replays: no simulation change.**
- Every replay check that does not depend on the level fingerprint passes, and `src/testing/replays` has no diff.
- I also re-checked the five goldens whose fingerprints are currently stale (see Outstanding) with a scratch test that skips only the fingerprint comparison. All 11 level/test-chamber goldens, plus every level fuzz fingerprint, match in per-tick hashes, event counts and completion tick. No campaign solution triggers either new event.

### 2. Audio (`src/engine/audio`)
- `gateBlocked` cue: the door's "uh-uh" warning (two falling squares) re-voiced in the gate's violet temporal timbre. It adds vibrato detune, a faint FM bell and a three-burst stutter of field noise. It means the same thing as the door cue but clearly comes from the field.
- `elevatorHeld` cue: a brake clamp thump, then a stalled motor (a low saw that sags instead of ramping up), then a coral two-beep warning.
- Both are spatialised and keyed (`gateBlocked:<id>`, `elevatorHeld:<id>`) through the existing world-component branch of `mapEvents`.

### 3. Graphics feedback (`src/graphics/entities`, `src/graphics/effects/vfx.ts`)
- **Held lift** (`ElevatorVisual`, `state.held`), eased so a one-tick hold does not flash:
  - The edge strips and deck chevrons turn from teal to a pulsing **coral**.
  - A raised coral frame appears along the deck edge ("clear the edge"). It is hidden otherwise, so it adds no draw calls in normal play.
  - The machinery visibly **stalls**: the piston and deck shudder in place.
  - `elevatorHeld` adds a one-shot coral floor ring and sparks.
- **Gate held open** (`TemporalGateVisual`, `state.held`):
  - Status lamps on the ring's crown use the door's lamp language: teal when open, coral when closed, **pulsing gold while held**, at the same 12 Hz pulse as the door's blocked lamp.
  - The glow band warms toward gold with the same pulse, and the field arcs slow to a strained crawl. An un-held gate spins exactly as before.
  - `gateBlocked` and `doorBlocked` both add a short gold spark burst at the lamp.
- Showcase check: `graphics-preview.html?scene=showcase&held=1` forces both states.

### 4. Head look target (`src/graphics/animation/lookTarget.ts`, new)
`selectLookTarget(state, actor, timeline, defOf)` picks what the head looks at:
1. **The interactable actually targeted.** It uses the sim's own candidate rule (contracts §7): the probe cell (centre + facing × REACH) first, then the actor's own cell, in id order, within one height level. Candidates are limited to what E would act on now:
   - empty-handed: crates, loose cells, timed switches, sockets that hold a cell, cycle-mode lifts
   - carrying a cell: an empty socket
2. **Otherwise, while idle, the next echo-intent target**: the soonest planned interaction within the badge lookahead (4 s) of any shown echo (an echo only follows its own track), whose object is within 3.5 tiles. If an echo carries the object, the head looks at that echo.
3. **Otherwise null**, which falls back to the faced cell (the old behaviour).

`GameRenderer.syncActors` now calls `ActorVisual.setLookTarget` every frame, using the timeline already passed in through `setTimeline`.

### 5. The colour-blind / high-contrast palette now applies in 3D
- `src/graphics/materials/palette.ts`: `ECHO_PALETTES.{default, highContrast}` use **exactly the UI timeline colours** (`src/ui/palette.ts`). A unit test asserts that echo indices 0–11 match in both palettes. New helpers: `echoTint(i, palette)`, `playerTint(palette)` and `echoPaletteOf(name)`.
  - Behaviour change: the default 3D echo tints now equal the default timeline colours (cyan, azure, violet, teal, lilac). Before, 3D used its own six cyan-family tints, so from Echo 3 on the hologram and its timeline track had different colours.
  - Echo 1 and 2 are visually unchanged (#3fd8ff → #3fd9ff, #5c8dff → #4f8dff). All 3D visual baselines pass without re-blessing.
- Re-tinting with no rebuild of the scene:
  - `ActorVisual.setPalette` re-tints the hologram, halo, x-ray silhouette, trail and number badge. The player halo becomes yellow (#ffd400) in high contrast.
  - `EchoIntentLayer.setPalette` re-tints the badges.
  - `GhostPathLayer.setPalette` rebuilds the current paths and their label textures.
- **Renderer API (shared file, additive):** `GameRenderer.setEchoPalette('default' | 'highContrast')` in `src/engine/rendering/GameRenderer.ts`. Actors created later inherit it.
- **App wiring (minimal additive edit, `src/app/bootstrap.ts`, 2 lines):** `renderer.setEchoPalette(settings.echoPalette)` at boot and in `applySettings`.
- Preview: `graphics-preview.html?palette=highContrast`.

### 6. Character turntable (`?turntable=1`)
- `src/graphics/turntable.ts` (new): a studio scene that shows the real `ActorVisual` / `Character` from the **front three-quarter** angle on a pedestal, with the game's lighting language and post chain.
  - Options: `&actor=player|echo`, `&angle=<deg>` (default 35), `&spin=1`, `&look=camera|forward`, `&palette=highContrast`, `&quality=`.
  - `&t=<frames>` is a deterministic screenshot mode that sets `window.__PREVIEW__.ready`.
- `src/graphics/previewEntry.ts` (new) and `graphics-preview.html`: the page entry now loads `turntable.ts` or `preview.ts` on demand. The `?scene=` behaviour is unchanged (the visual specs pass).
- README URL-options line updated (additive).

## Shared files touched (all additive)
- `src/engine/contracts/events.ts`: two event members.
- `src/engine/contracts/entities.ts`: optional `TemporalGateState.held?`, which is documented as not hashed.
- `src/engine/rendering/GameRenderer.ts`:
  - the `setEchoPalette` API
  - stores the timeline and entity definitions for the look target
  - one call to `selectLookTarget` per actor in `syncActors`
  - passes the palette to new actors
- `src/app/bootstrap.ts`: 2 lines (`setEchoPalette`).
- `graphics-preview.html`: script entry. `README.md`, `docs/architecture/{contracts,overview}.md`: one line or paragraph each.

## Tests
New:
- `src/gameplay/entities/feedbackEvents.test.ts` (8): `gateBlocked`
  - fires once per hold
  - does not fire for an empty-cell close
  - re-arms for a second hold
  - fires when an echo holds the gate on replay
  - the `held` flag is not hashed (hash with the flag removed or false equals the live hash)
  - two runs agree tick for tick
  - `elevatorHeld` fires once on a held departure and not on a free ride
- `src/graphics/materials/palette.test.ts` (5):
  - 3D and UI palettes are identical for echoes and the high-contrast player
  - wrapping and fallback
  - intent badges re-tint on palette switch
  - ghost paths rebuild in the new colours
- `src/graphics/animation/lookTarget.test.ts` (9):
  - targeted switch at head height
  - candidate order (probe, then own cell, id order, height level, facing)
  - only E-actionable kinds count
  - carrying a cell → empty socket
  - cycle-mode lifts only
  - echo-intent glance (soonest, near, idle, lookahead, hidden echoes, own track for echoes)
  - targeted beats intent
- `src/engine/audio/audio.test.ts`: the new cues are in the full-coverage mapping test, plus a dedicated test (keys, category, distinct from the door recipe). The generic recipe test also checks that both new graphs build and terminate.

Runs:
- `npx vitest run src/graphics src/engine/audio src/gameplay/entities`: 12 files, 106 passed.
- `npm run verify`, first run:
  - typecheck clean, build OK
  - Vitest 42 files: 569 passed, 6 failed
  - All 6 failures were level-fingerprint mismatches in `replays.test.ts` caused by another agent's hint-text edits (see Outstanding 1). None came from this work.
- `npm run verify`, final run (after someone else re-blessed those goldens): **exit 0**, typecheck clean, **42 files, 575 tests passed**, build OK.
- `CI=1 E2E_PORT=4977 npx playwright test tests/e2e/visual.spec.ts`: **6/6 passed** (all four 3D baselines and both UI baselines), no re-bless.
- Screenshots (scratchpad only, not in `docs/`):
  - `tt-player-final.png` (turntable, front three-quarter)
  - `tt-echo-hc2.png` (high-contrast echo hologram)
  - `held-closeup.png` (coral held lift + gold held gate)
  - `chamber-hc.png` (Echo 2 green in high contrast)
  - No console or page errors in any of them.

## Outstanding / for the director
1. **Golden re-bless (not by me).** Another agent's hint-text edits in `src/levels/definitions/L01, L03, L07, L10, test-chamber` (`Press R` → `Press {echo}`) changed those level fingerprints. Those goldens and `fuzz-fingerprints.golden.json` have since been re-blessed in the working tree by someone else.
   - I checked that diff: only `levelFingerprint` lines changed. No hashes, event counts or completion ticks changed.
   - That matches my own check with the fingerprint skipped. This work changes no golden.
2. Default-palette echo colours from Echo 3 on changed from cyan-family to the UI's violet/teal/lilac, so 3D now matches the timeline. If the art director prefers the all-cyan look, change both tables together; `palette.test.ts` enforces that they match.
3. The look-target echo-intent glance uses the timeline the app already passes to `setTimeline`. In attract mode and menus that is null, so only the "targeted" rule applies there.
4. Not tested on real GPUs, so the feel of the 12 Hz pulses and shudder at 60 fps has not been checked.
