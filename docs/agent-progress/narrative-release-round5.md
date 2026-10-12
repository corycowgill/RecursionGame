# Narrative & release engineer — round 5

No earlier work existed for this role. The interrupted attempt's commits held only puzzle-analyst, art and solver
changes, so everything below was built in this session. `npm run verify` is green: typecheck, 48 test files with 636
tests, and the build.

## Completed

1. **Story pass** (`docs/game-design/story.md`): an understated mystery. You wake in the empty Ascendant Facility.
   Logs signed "H.A." describe a "crew" that is always the same person, and the loop drifting. The Core's log (LOG 000,
   recorded first, found last) names you: Ansel, the researcher, was always you.
   - All ten `story` arrays were rewritten to three lines each: location, narration, environmental log.
   - The narration keeps each level's teaching cue. No key names appear; `actionText.test` still checks every string.
   - Hints are unchanged.
   - Location wings match the art team's lighting moods.
   - The intro card styles `LOG <id> · …` lines as logs (`src/ui/menus/narrative.ts`).
2. **Ending** (`src/app/ending.ts`, `src/ui/menus/Ending.ts`). After the **first** clear of L10 it plays in-engine:
   - Follow-camera pull-back (`setFraming` zoom 1 → 2), then the overview shot of the Core.
   - The echoes walk into the player and disappear (`convergeView`, a derived copy of the frozen final state; the sim
     is not touched).
   - Three lines of text, then a fade to white, then the credits roll, then the main menu.
   - **Skippable** by any fresh input: a key (repeats ignored), click or tap, any controller button, or Esc/B. Input
     in the first 0.5 s is ignored. Reduced motion cuts straight to the overview.
   - A repeat clear shows the results card with **Watch ending**.
3. **Credits** (`src/ui/menus/Credits.ts`), replacing the old placeholder in `Overlays.ts`:
   - "HALLUCINATED GAMES presents" in the ident's style (Orbitron, the white → green → purple → gold gradient, green
     glow, Rajdhani "presents" with a green rule), then RECURSION.
   - "Built by an AI agent team directed by Cory Cowgill", the 8 requested roles plus 8 additional round roles, and a
     note that every role was an AI agent (Claude, made by Anthropic).
   - Licenses: three.js MIT; Orbitron and Rajdhani, SIL OFL 1.1, with copyright lines taken from the package
     `LICENSE` files.
   - Keyboard ↑/↓ steps through the sections and Esc leaves; the D-pad and A/B work through createUI's spatial
     navigation; on touch the roll scrolls (pan-y) and has a Back button.
   - After the ending it fades in from white and rolls by itself until the first user input.
4. **Progress / replay:** no new save field was needed. L10's recorded completion unlocks **Ending** and **Credits**
   buttons in level select. A replay away from a finished Core loads L10 and simulates its verified solution
   (silently, through the real sim) before playing the ending.
5. **Share images:**
   - `public/og-image.jpg` (1200×630, 90 KB JPEG): a real L10 overview frame captured with Playwright at `quality=high`
     (temporal preview pinned at tick 640, HUD hidden), with the game's own RECURSION logotype composited by the
     capture script.
   - `index.html` gained og:type/site_name/title/description/image(+type, size, alt) and twitter:card/title/
     description/image(+alt).
   - The image URLs use `%VITE_SITE_URL%og-image.jpg`. The single constant is `VITE_SITE_URL` in the new `.env`
     (empty = relative URL); a Render build env var with the same name overrides it. I checked that the build replaces
     it (relative by default, absolute with the env var set).
   - Documented in the index.html comment, the README deploy section and story.md: og:image needs the absolute URL
     once the Render domain is known.
6. **Tests:**
   - `src/app/ending.test.ts` (9): L10 complete → ending → credits → menu, driven by the real verified L10 run; skip
     (grace period, idempotent, fast fade); cancel; the timeline; reduced motion; convergeView leaves the live hash
     untouched.
   - `src/ui/menus/narrative.test.ts` (10): story-line rules; the ending overlay skips on key, pointer, pad button
     and Back, and ignores key repeats; credits content and keyboard navigation; auto-roll stops on input; createUI
     wiring (Esc / pad B, the ending as a blocking base screen, the level-select buttons, "Watch ending").
   - `tests/e2e/credits.spec.ts` (4, all pass on a private port): keyboard, mocked gamepad, iPhone touch (CDP drag
     scroll + tap), and a seeded finished campaign → level select → Ending → skip with a key → credits → Esc → menu.

## Golden replays (justified re-bless)

The story text is part of `levelFingerprint`, so all ten level goldens and the fuzz fingerprints were re-blessed. **Only
the fingerprint lines changed** (20 lines). Every per-tick hash, digest, checkpoint and completion tick is identical. No
simulation or layout change.

## Shared-file edits (minimal, additive)

- `src/ui/createUI.ts`:
  - `ScreenName` gains `'ending'`; `showCredits(opts?)` and `showEnding(...)` added.
  - `back()` delegates to a base screen's own `back()` (ending → skip, post-ending credits → menu).
  - Level select and the results card receive `onPlayEnding`.
- `src/ui/types.ts`: optional `UICallbacks.onPlayEnding` and `LevelCompleteStats.hasEnding`.
- `src/ui/ui.test.ts`: one `onPlayEnding: vi.fn()` line in the mock (required by the mapped type).
- `src/app/bootstrap.ts`, `src/app/flow.ts`: the `ending` / `credits` app modes, an `EndingFlow` instance,
  `startEnding` / `replayEnding`, the ending branch in `onComplete`, the ending view and framing in the frame loop, and
  throttled rendering during the credits.
- `README.md`: one share-card paragraph in "Building and deploying".
- `index.html`: meta tags only; the intro scripts and the existing meta are unchanged.

## Tests run

- `npm run verify`: green (636 tests).
- `npx playwright test tests/e2e/credits.spec.ts`: 4/4 pass.
- `npx playwright test tests/e2e/visual.spec.ts --grep "UI states"`: 2/2 pass. The level-select header layout is
  unchanged until the campaign is finished, so the snapshots still match.
- Ending screenshots were checked in the scratchpad (SwiftShader).

## Outstanding / needs a playtest

- **Subjective, needs a playtest:** whether the log lines read as mystery or clutter on the intro card; ending pacing
  (about 14.6 s, only seen at about 0.5 fps); whether the reveal lands without in-world props.
- At share-card size the characters are tiny. The image sells the monumental Core, not the echoes. A closer hero shot
  needs a camera API that graphics owns.
- **Precache:** the release engineer may want `og-image.jpg` excluded from the service-worker precache. The precache
  plugin (`src/build/precacheManifest.ts`) is not mine, so every offline install currently downloads the 90 KB image.
- **The echoes vanish abruptly** when they reach the player, because the renderer disposes their visuals. A
  dissolve/merge VFX hook would need graphics.
- `release-notes.md` has not been updated (director-owned). This report has what it needs.
