# Mechanics engineer, round 6 (expansion): progress log

Task: implement Chrono Relay (`chronoRelay`), Check Valve (`checkValve`), Attuned Devices + Paradox Glass
(optional config on pressurePlate / timedSwitch). Do not commit. Do not touch L05.

## Status (update as you go)
- [x] contracts: CORE_ENTITY_KINDS (frozen 12) + ENTITY_KINDS (+checkValve, chronoRelay); configs/states in entities.ts
- [x] chronoRelay behaviour (src/gameplay/entities/chronoRelay.ts) + tests (chronoRelay.test.ts)
- [x] checkValve behaviour (checkValve.ts) + tests (checkValve.test.ts)
- [x] attuned / glass on pressurePlate.ts + timedSwitch.ts + tests (attuned.test.ts)
- [x] validator rules: src/levels/validators/mechanics.ts (+ mechanics.test.ts), called from validateLevel
- [x] QA invariants: valve exemption in 'solid' + stateful checkValveCrossings()
- [x] campaign.test 'finale uses every kind' -> CORE_ENTITY_KINDS
- [x] solver support: navigation directed valve edges + reversed-edge distancesTo + avoid sets; macros relay waits, chronoRelay signals, reversible-valve sources, attuned pruning (`only`), glass `~glass` route variants; teaching.ts helpers; levelConfigs teachesRelay/teachesValve/teachesAttuned + SANDBOX_ANALYSIS; verify.ts recordEchoes (outcomes for divergence checks); difficulty relay terms; cli finds sandbox levels; tests src/testing/solver/mechanics.test.ts
- [x] visuals: src/graphics/entities/expansion.ts (ChronoRelayVisual, CheckValveVisual, AttunedDecor used by plate/switch visuals in mechanisms.ts); EntityVisual.onEvent + EntityVisualContext.level (GameRenderer passes level and routes events); vfx.ts entity/attuned cues
- [x] audio: sfx recipes valvePass/valveDenied/valveFlip/relayArm/relayEmit/shatter/attunedFail, mapping.ts routes; loops.ts 'relay' ticking loop
- [x] timeline: src/ui/timeline/devices.ts (relayRows, collectShatters), model.ts intended (attuned) divergences violet, TimelinePanel relay rows + shatter markers (+ expansionStyles.ts); createUI passes relays, noteEvents, attuned toasts (src/gameplay/puzzles/mechanicText.ts)
- [x] sandbox levels src/levels/definitions/sandbox-{relay,valve,attuned}.ts + sandbox-levels.ts (SANDBOX_LEVELS), tests src/levels/sandbox.test.ts
- [x] fuzz: expansionGauntlet() in src/testing/qa/fixtures.ts, fuzz targets + sandboxes, valve crossing check per tick, event tally by entity name; fuzz golden: one APPENDED entry (existing entries byte-identical)
- [x] docs: contracts.md §5 'Round-6 expansion mechanics' (valve, attuned/glass), §9 'Chrono relay' (latency contract), §10 events; overview.md module map
- [x] npm run verify green (02:5x): typecheck, 57 files / 731 tests, build
- [x] browser screenshots of the sandboxes (graphics-preview.html?scene=level&id=S01..S03), scratchpad r6-*.png, no page errors. NOTE: the preview's `t=` fast-forward loops forever if t is past the level's completion tick (S01 completes ~470, S03 ~245): use t below that.

## Notes
- Full `npx vitest run`: 57 files / 731 tests green (02:19).
- Goldens: all 10 level goldens unchanged after the registry extension (replays test green).
- Test helper: src/gameplay/entities/testkit.ts (mini level fixture).

- Other small edits outside my area (all additive): GameRenderer (pass `level` to visuals, route events to
  `EntityVisual.onEvent`), graphics/preview.ts (sandbox ids), createUI.ts (relay rows, shatter notes, attuned toasts),
  levels/validators/validateLevel.ts (call validateMechanics, relay wall-cell exemption), campaign.test.ts (CORE kinds),
  testing/qa (invariants, fuzz, fixtures), testing/replays (one appended fuzz fingerprint).
- Solver: verifySolution now re-records echo loops (recordEchoes) so solver-found loops carry outcomes; divergence
  counts for blind solutions are now reported (previously always 0 for solver loops).
- For level designers: sandbox examples in src/levels/definitions/sandbox-*.ts; teaching helpers in
  src/testing/solver/levelConfigs.ts (teachesRelay / teachesValve / teachesAttuned) and teaching.ts.

## Open items / suggestions
- Valve visual in S02 is partly hidden behind the wall block south of it from the default camera; level designers should
  leave the cells next to a valve visible (or set camera yawStep).
- The relay tube runs at 0.55 m above floor along an x-then-z route to its first wired target; in tight rooms it can sit
  behind railings. A dedicated route param could be added later (decor-only).
- Solver: valve phaseTicks (saturating at 600) delays quiescence detection by up to 10 s in valve levels (cost only).
