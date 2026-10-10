# Progress: Level Designer (Agent 6)

## Summary
The campaign now has all **10 chambers**. L04–L10 are authored, machine-verified and wired into `CAMPAIGN_LEVELS`, so
the menus, level select, attract mode, e2e level sweep, golden replays and QA fuzz all pick them up automatically.
Level 8 introduces a **new deterministic engine mechanic, nested loops** (`LevelDefinition.recursion`): each recording
is replayed by its echo and by a recursive copy 5 s later. Level 5 needed one small component addition, a **timed-switch
cooldown**. L01–L03 were reviewed and left as they are; the curve already ramps 1 → 3.5 into L04.

Full design document with every level's teaching goal, walkthrough, hints, limits and alternates:
**`docs/game-design/levels.md`**.

## Completed

### Levels (`src/levels/definitions/`)
| # | File | Teaches | Echoes min/limit/par | Par (best) |
|---|---|---|---|---|
| 4 | `L04-the-lift.ts` | elevator, vertical separation, boarding before the call | 2/3/2 | 18 s (13.4) |
| 5 | `L05-perfect-timing.ts` | moving platform, switch windows + cooldown, scheduling | 2/3/2 | 16 s (11.4) |
| 6 | `L06-chain-reaction.ts` | lasers/receivers, signal chain, 3-echo dependency chain | 3/3/3 | 20 s (12.3) |
| 7 | `L07-broken-sequence.ts` | inputs-not-results, intentional broken recording, divergence as a tool | 2/2/2 | 14 s (12.6) |
| 8 | `L08-recursive-machine.ts` | nested loop (recursion engine), self-relay | 1/1/1 | 22 s (19.8) |
| 9 | `L09-paradox-chamber.ts` | mutual dependency, delete and re-record, inverted wire | 2/2/2 | 18 s (14.8) |
| 10 | `L10-the-core.ts` | finale: all 12 components, echo-only gate, twin timers | 3/3/3 | 24 s (17.7) |

Each level has: an ASCII map plus design notes in its header, story text (3 lines), subtitle, objective label, 3–4
progressive hints, echo limit, par echoes and par time, camera focus and intro fly-through path, decor (all conduits
are wall-mounted), seed, `teaches` tags, and a closed-loop known solution.

### Nested loops: engine mechanic for L08 (temporal engine, additive)
* `src/engine/simulation/recursion.ts` (new): `replayTracks(level, loops)`, `trackInputAt`, `trackFinishedAt`,
  `recursionCopies`. This is the single expansion of loops into echo actors.
* `src/engine/simulation/step.ts`: `createInitialState` builds actors from replay tracks (copies get
  `recursion: k` and id `echo:<loopId>.<k>`). `levelComplete.echoesUsed` now counts recordings, not bodies; the value
  is identical for every level without recursion.
* `src/engine/temporal/TemporalGame.ts`: per-tick frames, divergence expectations (shifted by each copy's offset)
  and timeline tracks (copies get `recursion` and `startTick`, with shifted planned markers) all come from replay tracks.
* Backward compatible: without `recursion` the actor list, the state and the hashes are unchanged. The existing
  L01–L03/T00 golden replays are byte-identical.
* Documented in `docs/architecture/contracts.md` §8b.

### Timed switch cooldown (gameplay, additive)
* `TimedSwitchConfig.cooldownTicks?` / `TimedSwitchState.cooldown?`. Presses fail with `'cooldown'` while it counts
  down. The E-prompt predictor (`targeting.ts`) now reports running (`retrigger:false`) and cooling switches as
  `blocked`.

## Files changed
**Owned (src/levels):** `definitions/L04…L10-*.ts` (new), `definitions/index.ts` (exports and campaign order),
`campaign.test.ts` (10-level list, intended-divergence allowlist, per-level tests).

**Contracts (additive only):**
* `src/engine/contracts/level.ts`: `LevelRecursion`, `LevelDefinition.recursion?`
* `src/engine/contracts/state.ts`: `ActorState.recursion?`
* `src/engine/contracts/game.ts`: `TimelineTrack.recursion?`, `startTick?`
* `src/engine/contracts/temporal.ts`: `recursiveEchoActorId()`
* `src/engine/contracts/entities.ts`: `TimedSwitchConfig.cooldownTicks?`, `TimedSwitchState.cooldown?`

**Engine (temporal engineer's module, please review):** `src/engine/simulation/recursion.ts` (new),
`simulation/step.ts`, `simulation/index.ts`, `temporal/TemporalGame.ts`, `temporal/recursion.test.ts` (new, 6 tests).

**Gameplay:** `entities/timedSwitch.ts`, `interactions/targeting.ts`, `entities/timedSwitchCooldown.test.ts` (new, 3 tests).

**Outside my area (minimal, needed for correctness):**
* UI: `src/ui/hud/Hud.ts`, `src/ui/timeline/TimelinePanel.ts`. Echo counts now ignore nested-loop copy tracks
  (`t.recursion === undefined`); otherwise the L08 HUD would show 2 of 1 echoes.
* QA: `src/testing/qa/invariants.ts`, `src/testing/qa/fuzz.ts`. The "actor list matches loops" and "timeline track
  count" invariants now derive the expectation from `replayTracks`.
* QA goldens: `src/testing/replays/L04…L10-*.golden.json` (new) and `fuzz-fingerprints.golden.json` (new entries),
  generated with `npm run replays:update`. The existing entries are unchanged.

**Docs:** `docs/game-design/levels.md` (new), `docs/architecture/contracts.md` (§8b nested loops, cooldown, ActorId,
LevelDefinition), `docs/art-direction/screenshots/levels-{L04,L08,L10}-overview.png`, `levels-L10-follow.png`.

## Tests run (real results)
* `npx tsc --noEmit`: clean.
* `npx vitest run` (full suite): **24 files, 400 passed, 3 expected-fail** (the QA known-bug markers, not mine), 0 failed.
  * `src/levels` (campaign + levels): 97 passed. For every level: validation with 0 errors and 0 warnings, the
    solution completes within limits with 3 stars, per-tick hashes match across runs and in pure replay, solo and
    single-loop attempts fail, divergences are exactly the intended ones (L07 `none→use`, L10 `fail→insert`, all
    others none). Per-level minimum-echo and mechanic tests, including the L09 delete-and-re-record flow driven through
    `deleteLoop`.
  * `src/engine/temporal/recursion.test.ts`: 6 passed. `timedSwitchCooldown.test.ts`: 3 passed.
  * `src/testing/replays`: 24 passed (goldens for all 10 levels plus fuzz fingerprints). `src/testing/qa`: 117 passed
    plus 3 expected-fail (fuzz over every level, save/load, softlock).
* `npx vite build --outDir <scratchpad>`: succeeded. I built to a scratch directory so I didn't overwrite the shared
  `dist/`; `npm run build` runs the same tsc and vite steps.
* Visual check: headless Chromium (SwiftShader) screenshots of L04, L08 and L10 (overview and follow) through
  `graphics-preview.html?scene=level`. No page or shader errors; the only console error was a favicon 404 on the
  preview page. This led to L10's western wall mass being opened into an abyss and all conduits being moved onto
  walls. The preview server was stopped.
* Not run: Playwright e2e. Its level sweep now covers 10 levels, about 3× longer in software WebGL. I left it to the
  director/QA to avoid contending for the 4 CPUs.

## Outstanding issues
* **Minimum-echo proofs** are hand-written negative strategies plus body-count arguments, not an exhaustive search.
  L10's 3 is a practical minimum: bringing the Courier back through the echo-only gate would need a second blind
  recording.
* **Nested-loop presentation:** copies render with their echo's tint and badge, and the timeline lists them as a
  second "Echo N" track. UI/Graphics should add a ↻ badge, offset the copy's bar to `startTick`, and make the eye
  toggle hide `echo:<id>.<k>` too (bootstrap's `hiddenEchoes` uses `echo:${loopId}` only).
* **Decor vocabulary:** `archway`, `machinery` (variants `winch`, `gears`, `clockwork`, `optics`, `archive`, `vault`,
  `recursionEngine`, `coreDynamo`), `hologram`, `banner` and `abyssLight` are authored but ignored by the current kit;
  only `conduit`, `observationWindow`, `ring` and `lamp` render.
* **e2e duration:** the "every level loads, renders and completes" sweep in `tests/e2e/smoke.spec.ts` will take
  roughly 3× longer with 10 levels under software WebGL.
* The audio "rewind/bloom" variants for nested loops (suggested by Audio) don't exist yet. Copies spawn silently,
  with no `echoSpawned` event, since they exist from tick 0 of every pass.

## Dependencies / requests
* **Temporal engineer:** review `recursion.ts` and the `TemporalGame`/`step.ts` changes (all additive, golden-verified).
* **UI:** recursion badge and bar offset for copy tracks (see above). The level select can drop its placeholder
  padding for 4–10.
* **Graphics:** a copy/↻ visual for `actor.recursion`; consider rendering the decor types listed above. L10's crown
  ring and abyss look good already.
* **Director/QA:** run the e2e sweep once (it now covers 10 levels).

## Next tasks
* A bounded brute-force minimum-echo search in `src/testing` to turn the per-level minimum claims into proofs.
* Real-GPU playtest pass of L05 (ferry timing) and L07–L09 (conceptual leaps). Tune hint delays and par times from
  real play data.
* Optional: per-level ambience and backdrop variation hints (needs a contract addition and Graphics/Audio sign-off).
