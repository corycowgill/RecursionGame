# Game Director: round 5 verification

Scope: verify the round-5 team's work (puzzle analyst, art & rendering, narrative & release), fix integration problems
minimally, run the full e2e suite, play the ending path, refresh final screenshots, measure the shader warm-up and
the main menu, and update README and release notes (v0.5). Nothing committed.

## Results

| Task | Result |
|---|---|
| 1. `npm run verify`, golden review | **Green** at start and end: 48 files / 636 tests, none skipped (no `.skip` / `.only` / `.todo`), build OK. Golden diffs justified: the uncommitted ones are only the 20 `levelFingerprint` lines (all 10 levels' `story` text changed; level-definition diffs are only `story` lines). The committed L10 per-tick hash change comes from the new inverted socket→gate wire (closes the solver's 2-echo shortcut); completion tick unchanged (1063). L02/L05/L06: fingerprint lines only. |
| 2. Full e2e suite | `CI=1 E2E_PORT=4401 npx playwright test`: **22 passed, 0 failed, 30.1 min**. All visual baselines matched, **no re-bless**. The 3D baselines show L03 (Lab mood) and default-mood scenes; the L03 mood shift stays inside the 5 % / 0.3 tolerance. |
| 3. Ending path | L10 completed through the debug hook on a fresh save (real app, high quality). The ending starts on the first clear. One input skips it with keyboard (KeyX), mocked Xbox pad (A) and iPhone-emulated touch (tap). Credits show the studio header, "directed by Cory Cowgill" and licences. Esc / B / tap on "Main menu" go back to the menu. L10 is saved; the sim hash is the same before and after the ending; **0 console errors or warnings** in 4 runs. Left alone it plays through to the credits and the menu (126 s of wall time at SwiftShader frame rates, so the 10–24 s skips were real skips). |
| 4. Screenshots | Overwritten `final-L01…L10-midsolve.png` and `final-character.png`; added `final-ending.png` and `final-credits.png`. Compared against the concept sheet: moods read as intended, no regressions. Known gaps: head small and hair blocky against the concept; L07's player is behind the gate arch at that tick (same as v0.4). |
| 5. Measurements | First-echo hitch (L01, 3 runs per cell, before = this tree with `prewarm()` disabled): high **11.5 s → none**, low **7.2 s → none** (medians). Level load +7 to +8 s (high 10.9 → 18.1 s, low 8.5 → 16.2 s). Main menu (low, 4 runs each, alternated): frame stall after the menu appears 10.2 → 6.4 s; menu steady **14.6 → 10.7 s**. Full tables are in the release notes. |
| 6. Docs | README (story/ending/credits, moods, playtime estimate with link, `npm run solve`, e2e ~30 min / 22 tests, story doc link, later roles). Release notes v0.5 at the top of `release-notes.md` (old v0.4 heading demoted to match older sections). |

## Director fixes (minimal)

- `src/app/bootstrap.ts`: main-menu footer `version: 'v0.1 · vertical slice'` → `'v0.5'` (the menu said "vertical
  slice" in a complete 10-chamber build). The main-menu UI visual test was re-run and passed within tolerance; the
  baseline was not re-blessed, so it still shows the old footer text.

No other code changes were needed. The narrative agent's shared-file edits (`createUI.ts`, `types.ts`, `ui.test.ts`,
`bootstrap.ts`, `flow.ts`, `LevelSelect.ts`, `Overlays.ts`, `index.html`, README) were reviewed and are additive and
covered by tests.

## Open items for the product owner

1. **L05 can be solved with one echo.** Choose an option in `docs/game-design/difficulty-report.md` §3.1.
2. **Playtest:** the model estimates 31–134 min (median ≈ 61). L05–L10 are flagged.
3. Set `VITE_SITE_URL` for share cards. Whether the og image should be precached is up to the release engineer
   (`precacheManifest.ts`).
4. Art pass on hair and head proportions; real-GPU check of the level-load compile cost.

## How measured (scripts in the scratchpad `dir5/`, not committed)

- `ending-play.mjs <base> keyboard|pad|touch|none [shots]`, `finals5.mjs`, `lt.mjs` (first-echo long tasks, from
  round 4's `longtask.mjs`), `menu5.mjs` (long tasks + rAF frame gaps + `mode` timestamps). The before/after builds
  were tree copies in the scratchpad; the "before" copy differs only by an early `return` in `GameRenderer.prewarm()`.
  The servers on ports 4411/4412 were mine and were killed by PID. Playwright's own servers (4401, 4402) exited with
  their runs.
