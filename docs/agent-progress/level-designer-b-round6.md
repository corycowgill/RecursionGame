# Level designer B, round 6 (expansion): progress log

Owns: src/levels/definitions/L14-gold-and-cyan.ts, L15-glass-gallery.ts, L17-upstream.ts, L18-hour-of-glass.ts,
their goldens, their solver configs and tests, docs/game-design/levels-round6-B.md. Does NOT edit
src/levels/index.ts / definitions/index.ts / campaign order (director). Do not commit. Do not touch L05.

## Integration plan (so files do not collide with designer A / the director)
- `src/levels/definitions/round6-b-levels.ts` exports `ROUND6_B_LEVELS` (my 4 levels, campaign `order` already set to
  the planned final value: 11, 13, 16, 17). The director imports the 4 level constants from there (or from the files)
  into CAMPAIGN_LEVELS.
- Solver configs live in `src/testing/solver/levelConfigs-round6-b.ts` (`ROUND6_B_ANALYSIS`); levelConfigs.ts
  `analysisFor` gets a 1-line lookup into it; cli.ts `levelById` gets ROUND6_B_LEVELS added (1 line each).
- Tests: `src/levels/round6-b.test.ts` (campaign-style battery + per-level lessons + solver teaching checks);
  goldens checked by `src/testing/replays/round6-b.test.ts` (skips chambers already in LEVELS).
- Goldens: `src/testing/replays/round6-b/<id>.golden.json` (sub-directory, because replays.test.ts flags any
  top-level golden whose level is not in LEVELS as orphaned). When the director adds the levels to CAMPAIGN_LEVELS:
  move the 4 files up into src/testing/replays/ (git mv) or run `npm run replays:update`; round6-b.test.ts in
  src/testing/replays skips chambers already in LEVELS by itself. The INTENDED_DIVERGENCES entries for campaign.test.ts are listed in levels-round6-B.md.

## Status
- [x] read docs / existing levels / sandbox examples / solver
- [x] L14-gold-and-cyan: built, tests green, golden blessed, solver find/proof/cheese run (k=0 exhaustive)
- [x] L15-glass-gallery: built, tests green, golden blessed, solver run (k=0 exhaustive; k=1 deep(3) exhaustive; k=1 wide(2) budget 300 s)
- [x] L17-upstream: REDESIGNED after the solver found a 7.9 s cheese (echoes walked UP the braked chute; and copies
      lagging 5 s held two plates without any valve split). Now: fixed non-return flap under the chute valve, plates
      pairwise >= 7.5 s apart, Head Plate in a 1-wide pocket. Solver: k=0,1 deep(3) exhaustive, k=1 wide(2) budget,
      cheese deep(2) exhaustive none, wide(2) budget none. Teaching check = valvePass(echo) + valveDenied(copy) + sides.
- [x] L18-hour-of-glass: solver done (plan check 27.2 s; k=0 exhaustive; k=1,2 budget-limited, body count airtight)
- [x] par + hints from the model applied (L14 11 s 0/50/100, L15 19 s 0/65/125, L17 24 s 0/85/170, L18 38 s 0/120/235)
- [x] goldens re-blessed after the par/hint edits
- [x] L15 k=1 wide(2) long proof: 1200 s, budget-limited, none
- [x] docs/game-design/levels-round6-B.md
- [x] npm run verify green (62 files / 855 tests, build OK)
