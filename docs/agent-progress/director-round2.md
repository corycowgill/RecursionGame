# Progress — Game Director: round-2 verification and integration

## Completed

1. **Gate on the incoming tree:** `npm run verify` green: typecheck clean, Vitest 30 files / 451 passed /
   0 expected-fail, build OK. Checked `src/testing/qa/known-bugs.test.ts`: the QA-1/2/3 cases are plain `it(...)`
   (no `it.fails`, no `.skip` anywhere), and `knownIssue()` in `fuzz.test.ts` returns `null`.
2. **Full e2e suite** (`CI=1 E2E_PORT=4321 npx playwright test --output=<scratchpad>`, 25.7 min): 12 passed,
   3 failed. All three were caused by intended round-2 changes:
   - `flows.spec.ts` "settings persist across a reload": `bootToMenu` uses `?quality=low`, and the UX change now
     locks the quality selector while a URL override is active, so the click on "Medium" timed out (the page snapshot
     showed the group disabled with "Set by the ?quality=low URL option"). **Fix:** this test boots with no query.
     It also now checks the lock itself: after reloading with `?quality=low`, Low is pressed, Medium is disabled
     and the saved preset is still `medium`.
   - `visual.spec.ts` `l03-follow-low` and `l03-overview-low` (6% pixels different). Side by side, the differences
     are the environment artist's intended changes: varied wall modules with windows and vents, the archway over the
     door, the floor hologram, the clock, machinery and backdrop through the pit, and quadrant floor tiles. No
     regressions. Re-blessed. `chamber-follow-high` and `showcase-overview-low` still passed against the old look
     because they were within the 5% / 0.3 tolerance. Since that look is out of date, I re-blessed them too
     (`--update-snapshots=all`) after the same review (new character, wall windows, framed grates).
   - Re-run of `visual.spec.ts` plus the settings test: **7/7 passed**.
3. **Repo-bloat source:** `tests/e2e/smoke.spec.ts` wrote `integration-*.png` into `docs/art-direction/screenshots/`
   on every e2e run, so each run produced about 22 MB of churn. It now writes to the git-ignored
   `test-results/smoke-shots`. (Today's run had already rewritten them, and the WIP checkpoint committed them.)
4. **Final screenshots** regenerated with the v0.1 director's driver against a fresh production build
   (`vite preview`, `?quality=medium`). Every existing `final-*.png` name was overwritten, and only two were added:
   - `final-character.png`: a 2x close-up of the protagonist in L04, `?quality=high`, wheel-zoomed.
   - `final-L05-preview.png`: Q preview held 40 ticks ahead at tick 100 in L05, showing the overview camera,
     two ghost paths and echo end badges.

   All 10 chambers completed in the app with no page errors. Compared with the concept sheet, the new screenshots
   are clearly closer than the v0.1 set. The heroine is white-armoured with gold edges, a glowing backpack and hair
   buns. Echoes are cyan glass. Walls carry arched windows, vents and pipe modules. The archway, holograms, clocks
   and the deeper backdrop now render. I found no regressions.
5. **Integration fix (readability):** the Q preview switches to the overview camera, where the 0.22-wide ghost-path
   ribbon was barely visible in L05. I widened it to 0.36 (`src/graphics/effects/ghostPaths.ts`, one constant) and
   checked the result in a recapture. The effects tests pass (13/13).
6. **Docs:**
   - `release-notes.md` is now v0.2: status table (components Done, indicators Done, visuals Mostly done), a round-2
     change list, rewritten known issues and next milestones, and actual test results.
   - `README.md`: ghost paths and walk-on badges, Q row, camera sensitivity / reduced-motion behaviour, `?quality=`
     semantics (lock, unknown value ignored, `ultra`), e2e duration ~26 min.
   - `qa.md`: QA-1/2/3 marked Fixed (round 2).
   - `art-bible.md`: points at `final-*` as the current screenshots.

## Not done: deleting superseded screenshots (needs a human)

`docs/art-direction/screenshots/` is ~77 MB. Deleting the unreferenced iteration screenshots was **denied by this
session's permission classifier**, both with `rm` and with `git rm`, even though they are tracked and recoverable
from history. I did not work around it. Files that no README, art-bible or release-notes text references, safe to
delete (about 50 MB):

- `v1-chamber-follow.png`, `v1-chamber-overview.png`, `v1-showcase-follow.png`, `v1-showcase-overview.png`,
  `v3-chamber-follow.png`, `v6-chamber-follow.png`, `v6-chamber-intro.png`, `v6-chamber-overview.png`,
  `v6-showcase-follow.png`, `v6-showcase-overview.png`, `v7-chamber-follow.png`, `v7-level03-follow.png`,
  `v7-level03-overview.png`
- `ui-*.png` (12 files; `ui-pause.png` and `ui-settings.png` in `visual.spec.ts` are snapshot names under
  `tests/e2e/visual.spec.ts-snapshots/`, not these files)
- `levels-L04-overview.png`, `levels-L08-overview.png`, `levels-L10-follow.png`, `levels-L10-overview.png`
- `integration-*.png` (19 files; no longer written by the smoke test)

Only the historical agent reports (`graphics.md`, `ui-ux.md`, `level-designer.md`, `director-integration.md`)
mention these files. The art bible already describes them as historical. Command for whoever has permission:
`git rm docs/art-direction/screenshots/{v1-*,v3-*,v6-*,v7-*,ui-*,levels-*,integration-*}.png`.
I did not convert `final-*.png` to JPEG. Without deleting the PNGs that would only add files.

## Files changed

- `tests/e2e/flows.spec.ts`: settings test boots without `?quality=` and asserts the URL-override lock.
- `tests/e2e/smoke.spec.ts`: review screenshots go to `test-results/smoke-shots`.
- `tests/e2e/visual.spec.ts-snapshots/{l03-follow-low,l03-overview-low,chamber-follow-high,showcase-overview-low}-chromium-linux.png`:
  re-blessed.
- `src/graphics/effects/ghostPaths.ts`: `RIBBON_WIDTH` 0.22 → 0.36.
- `docs/art-direction/screenshots/final-*.png`: 19 overwritten, plus `final-character.png` and
  `final-L05-preview.png`.
- `README.md`, `docs/agent-progress/release-notes.md`, `docs/agent-progress/qa.md`, `docs/art-direction/art-bible.md`,
  this file.

No simulation, gameplay, level or golden-replay changes by me; replays not regenerated.

## Tests run (real results)

- `npm run verify` (start): typecheck clean; 30 files, 451 passed; build OK.
- `CI=1 E2E_PORT=4321 npx playwright test`: 12 passed, 3 failed (above), 25.7 min.
- `npx playwright test tests/e2e/visual.spec.ts -g "3D scenes" --update-snapshots`: 4 passed (2 written).
- `npx playwright test tests/e2e/visual.spec.ts tests/e2e/flows.spec.ts -g "settings persist|3D scenes|UI states"`:
  7 passed.
- `npx playwright test tests/e2e/visual.spec.ts -g "chamber-follow-high|showcase-overview-low" --update-snapshots=all`:
  2 passed (re-blessed).
- `npx vitest run src/graphics/effects`: 3 files, 13 passed (after the ribbon change).
- `npm run verify` (end): typecheck clean; 30 files, 451 passed; build OK.
- Perf probe in the e2e run (SwiftShader): L10 high 0.41 fps / 376 draw calls / 767k triangles; low 0.48 fps / 253 /
  604k.
- After the ribbon change I did not re-run the full e2e suite. The change touches only the Q-preview layer, which no
  e2e baseline renders.

## Outstanding issues

- Superseded screenshot deletion (above) needs a human or a permission grant.
- `final-character.png` is a back view: the player spawns facing away in every chamber. A front three-quarter view
  needs a scripted turn or a turntable page.
- Ghost paths in L05 are short at the captured moment, because the echoes mostly wait. L06 shows longer trails.
- Not wired: `ActorVisual.setLookTarget` (head tracks the faced cell only), a held-lift visual, a `gateBlocked`
  event and audio cue, and the colour-blind palette for 3D echoes.
- Real-GPU performance is still unmeasured.
