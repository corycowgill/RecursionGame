# Puzzle analyst / level designer: round 5

Owner: `src/levels/**` (layout, entities, solutions, echo limits, par times, hint timing; not story or subtitle text) and
`src/testing/solver/**`. No commits (the director handles git). This round was resumed after a usage-limit cut-off.
The earlier attempt's work is in the `WIP: round-5 partial work` commit, and this report covers both halves.

## Summary

| Task | Result |
|---|---|
| Macro-action solver over the headless sim | **Done** (`src/testing/solver/`: navigation, macros, search, verify, slack, difficulty, analysis, cli, run.mjs). Bounded DFS over macro steps (go / press / pick / drop / hold / exit, with optional wait N ticks or wait-for-signal; live or blind walking). Prefix sharing by state cloning, sound pruning, time budget, sharded over worker threads. Every solution is re-verified through `TemporalGame`. |
| `npm run solve -- L07` | **Done.** Bundles the TS CLI with esbuild (comes with Vite) into `node_modules/.cache`; options in `cli.ts`. |
| Fast CI subset, L01–L04 | **Done.** `src/testing/solver/solver.test.ts`: rediscovers L01/L02, exhaustive fewer-echo proofs for L01–L04 within the CI bounds, plus static exit reachability for all 10 levels. About 20 s. |
| Min-echo proofs | **Exhaustive within documented bounds** for k < intended on all levels except L05 (counterexample found). Some wide or deep sets for L03/L06/L07/L09/L10 are budget-limited; see the report. |
| Cheese hunts | **4 found:** L02 doorstop (fixed), L06 doorstop (fixed), L10 Courier walk-back (fixed), L05 one-echo (**open, flagged**; no layout-only fix exists, see below). |
| Difficulty / playtime model | **Done** (`difficulty.ts`). All par times and hint delays now come from one formula; total estimate **31–134 min, median ≈ 61 min**. |
| `docs/game-design/difficulty-report.md` | **Written.** |
| Challenge variants | **Proposed** (efficiency / gold time / no-hint), not implemented: they need UI and save-format work outside my ownership. |

## This session (the resume)

1. **L05, the golden mid-edit.** The red goldens (L05 + fuzz fingerprint) were not a simulation change. The earlier
   attempt had blessed L05, then changed its par (16 → 15) and hint delays (30/60 → 60/115) to the model's values.
   Every per-tick hash is identical. I re-blessed: only the two `levelFingerprint` lines changed.
2. **L05, the one-echo cheese.** I tried the most plausible minimal layout fix: a partition wall on row 6 with a gap at
   the dock, which roughly doubles the walk from the Drive Switch to the Gate Switch, with a retimed intended
   solution. It works for the intended route (completes at tick 742), but analysis shows it cannot close the cheese.
   The island door has no deadline, so the player just waits longer. **Reverted.** Three real options, with my
   recommendation, are in `difficulty-report.md` section 3.1. The product owner should decide after a playtest. The
   current behaviour is pinned by an explicit campaign test.
3. **Remaining solver runs:** L07–L10 proofs and cheese hunts (480 s per job, 3 workers), and the L10 intended-plan
   check. Results are in the report.
4. **Difficulty table re-run:** every level's par and hint delays already equal the model's output.
5. **`docs/game-design/levels.md`** (my doc): the par column and per-level par lines now match the code, plus the
   par-formula principle, the playtime estimate and the "Known limits" solver note.

## Level-data changes this round (all with justification)

| Level | Change | Why | Golden |
|---|---|---|---|
| L06 | `plate-hall -> door-core` wire + conduit decor | solver's 2-echo doorstop route | re-blessed (same completion tick) |
| L10 | `socket-reliquary -> gate-reliquary` (inverted) | solver's 2-echo Courier walk-back | re-blessed (same completion tick) |
| L01–L10 | `parTimeSeconds`, hint `afterSeconds` | one consistent model instead of per-level feel | fingerprints only |
| L02 | `plate-a -> door-b` wire + conduit decor | solver's 1-echo doorstop route | re-blessed (earlier half) |

No hint or story *text* was touched.

## Shared files touched (minimal, additive)

* `package.json`: `"solve"` script (earlier half).
* `src/levels/campaign.test.ts`: regression tests for the two fixes and the pinned L05 behaviour (earlier half).

## Verification

* `npm run verify`: **green** (46 files, 617 tests, build OK) at the end of this session.
* Solver logs (scratchpad, not committed): `runs/proof.log`, `runs/proof2.log`, `runs/find.log`, `runs/find5.log`,
  `runs/diff2.log`, `runs/l10find.log`.

## Open / for the director and the product owner

* **L05 one-echo route**: decision needed (section 3.1 of the report). Until then, levels.md and the report say L05
  "can be solved with one echo".
* Budget-limited searches (L03, L06, L07, L09 wide k=1 or k=2; L07 no-blind cheese; L10 k=2) could be made
  exhaustive on a free machine with a 1 h budget per job.
* All time estimates **need playtest**; recalibrate the coefficients in `difficulty.ts` from real per-chamber times.
