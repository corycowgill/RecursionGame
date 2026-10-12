# Level designer A, round 6 (expansion): progress log

Owns: src/levels/definitions/L11-the-sump.ts, L12-late-light.ts, L13-roundabout.ts, L16-afterimage.ts,
src/levels/definitions/round6-a-levels.ts (ROUND6_A_LEVELS, for the director to register), their goldens
(src/testing/replays/round6-a/*.golden.json + src/testing/replays/round6-a.test.ts), solver configs
(src/testing/solver/levelConfigs-round6-a.ts), tests (src/levels/round6-a.test.ts), docs/game-design/levels-round6-A.md.
Does NOT edit src/levels/index.ts / definitions/index.ts (director does). Do not commit. Do not touch L05.
Shared edits (minimal, additive): levelConfigs.ts `analysisFor` looks up ROUND6_A_ANALYSIS; cli.ts `levelById` includes
ROUND6_A_LEVELS. Pattern mirrors designer B (round6-b-*).

## Status
- [x] read docs / existing levels / sandbox examples
- [x] L11-the-sump (order 5, LOG 036): valve teach + Store Door twist (the committing echo does its Store job first)
- [x] L12-late-light (order 8, LOG 055): relay teach, beat 1 solo + beat 2 body count, limit 1
- [x] L13-roundabout (order 9, LOG 058): clockwise valve ring, two timer hands 5 s apart via relay, full lap
- [x] L16-afterimage (order 15, LOG 092): relay + inverted wire + valve; Spire also needs the line (player rings again)
- [x] tests: src/levels/round6-a.test.ts (57 tests) green
- [x] goldens blessed in src/testing/replays/round6-a/ (after the final par/hint edit)
- [x] solver: find / proof / cheese for all four (results in docs/game-design/levels-round6-A.md)
- [x] difficulty model -> par + hints written into the level files (L11 17 s 0/25/55, L12 27 s 0/45/95,
      L13 33 s 0/60/125/185, L16 26 s 0/45/90/140); median 26 min for the four
- [x] --slack: tightest L13 271 t (4.5 s); all >= 2.5 s
- [x] screenshots: scratchpad r6a-L11/L12/L13/L16-overview.png (temporary scratch preview page, removed; vite stopped)
- [x] npm run verify green (61 files / 855 tests, build OK) at 05:3x
- [x] L13 k=1 deep(3)/wide(2): budget-limited 1200 s each, none (documented)

## Notes for the director
- `order` holds the planned campaign position (5, 8, 9, 15). When a chamber joins CAMPAIGN_LEVELS move its golden from
  src/testing/replays/round6-a/ up to src/testing/replays/ (round6-a.test.ts then skips it automatically; its orphan check
  flags a leftover file). The fuzz golden (fuzz-fingerprints) will gain entries for the new LEVELS: re-bless.
- actionText.test's `byOrder(3|7|10)` checks assume the old orders; renumbering moves L07/L10.
