# Game Director: round 6 integration (expansion)

Status: DONE (nothing committed; the director handles git).

## Checklist
- [x] 1. Integrate L11..L18 into CAMPAIGN_LEVELS (18, order field), goldens moved, save/select/menu fixes
- [x] 2. Story continuity (story.md, intros, ending)
- [x] 3. verify + solve all --difficulty, difficulty-report.md
- [x] 4. full e2e once (background), fix 10-level assumptions
- [x] 5. screenshots final-new-<slug>.png
- [x] 6. README, release-notes v0.6, levels.md

## Log
- Step 1 done: CAMPAIGN_LEVELS = 18 (definitions/index.ts); `order` fields of L05..L10 renumbered (6,7,10,12,14,18; only
  that line changed in each file, L05's puzzle untouched). Goldens moved up from round6-a/ and round6-b/; the inert
  round6-a/b replay tests deleted. L05..L10 goldens: levelFingerprint lines only. Fuzz golden: fingerprint lines +
  appended entries for the new levels (and the mechanics agent's gauntlet).
- Unlock rule: progression.levelUnlocked (shared by Campaign and LevelSelect): also unlocked when the level itself or
  any later level is completed (old saves keep reach). Tests in campaign.test.ts and ui.test.ts.
- Level select grid 6 columns (styles.ts, touchStyles.ts, arrowNav). Preview maxStars from length. Menu footer v0.6.
- Moods for L11..L18 (variants of their wing) in graphics/environment/moods.ts.
- Story lines >110 chars shortened (L15, L16, L17 x2, L18), cues kept. actionText.test by id not order.
- verify green after step 1 (see counts).
- Step 2 done: story.md table = 18 rows in campaign order (ids column); narrative.test asserts rising logs, Core = 000.
- Step 3 in progress: `npm run solve -- all --difficulty=<scratchpad>/find-merged-r6.json` (merged round-5 findall +
  designer finds). Stale find for L11 (6.55 s, pre-Store-Door) replaced by r-l11.json (10.62 s). L15/L16 re-find TODO.
- Step 5 in progress: scratchpad dir6/finals6.mjs (server: vite preview :4611, PID in scratchpad prev6.pid).
  r6-levelselect-oldsave.png / r6-menu-oldsave.png reviewed OK (6x3 grid, 10/18, 30/54, continue = Chamber 05).
- Step 3 done: difficulty table re-run on the integrated 18-level campaign: 61-268 min, median 122 (scratchpad
  difficulty2.log; find merge find-merged-r6.json). All 18 par/hint rows match the level files. difficulty-report.md
  updated (sections 2, 4, 5, 7). README playtime + mechanics updated.
- Timeline fix: recorded 'attuned' refusals on echo tracks drawn as the echo's press (pending/done), not a coral
  failure (src/ui/timeline/model.ts; test in devices.test.ts). Seen in L14/L18 screenshots.
- L13 mood keyFrom changed (glare from a back-light in the first shot). Reshoot pending.
- Readability fix: L15 row 5 and L18 row 5 interior walls -> railings ('='). Railings are solid for movement exactly
  like walls (isSolidTileKind; solver navigation walks only floor/ramp; lasers pass railings but L15 has none and
  L18's beam is in row 1). Goldens: levelFingerprint line only (per-tick hashes identical); fuzz digests identical
  (checked with a throwaway test, seeds 3/7/11 x 3000 ticks). Overview shots r6-L15-overview-rail2.png,
  r6-L18-overview-rail.png show the gallery, seal and Sump now visible.
- verify green (59 files / 976 tests). Preview server :4611 stopped. Starting full e2e: scratchpad dir6/e2e-full.log
- Step 4 done: full e2e `CI=1 E2E_PORT=4401 npx playwright test`: 21 passed, 1 failed (38.3 min). The failure was the
  ui-level-select visual baseline (new 6x3 grid). Reviewed side by side (scratchpad dir6/ui-level-select-*.png),
  re-blessed that one baseline only, re-ran the test: pass (2.1 min). Playwright's servers exited with their runs.
- Step 5 done: screenshots in scratchpad dir6/shots/final-new-<order>-<slug>.png (8) + r6-* overviews. Not copied into
  docs/ (round rule: screenshots never in docs/). Readability fixes: L15/L18 railings, attuned timeline marker,
  L13 mood glare.
- Step 6 done: README (18 chambers, mechanics, playtime, e2e time), release-notes v0.6, levels.md merged table,
  story.md, difficulty-report.md, overview.md module map, contracts.md note, designer docs integration notes.
- Final verify: green, 59 files / 976 tests (after the last source change).
