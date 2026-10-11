# RECURSION — Release Notes (v0.2, round-2 gap-fix review)

Date: 2026-10-11 (v0.1: 2026-10-10) · Build: `npm run build` → static `dist/` (relative base path) · Reviewer: Game Director

This is an honest status report against the master plan's **Definition of Done**. "Verified" means checked by a
test that was run for this release; "unverified" means nobody has been able to measure it yet.

## Summary

The full game loop works end to end in the browser: boot → main menu (live attract replay) → level intro →
record / rewind / cooperate with echoes → timeline inspect and temporal preview → level complete → next chamber,
with pause, settings, level select, save/continue and procedural audio throughout. All 10 campaign chambers load,
render and complete with their verified solutions both headlessly and in the real app. Round 2 closed the three
known physics bugs (QA-1/2/3), added Q-preview ghost paths and walk-on badges, wired camera sensitivity and reduced
motion into the renderer, rebuilt the protagonist and echo hologram, and rendered the full decor vocabulary with
varied wall modules. The biggest open risk is still **real-GPU performance and feel (never measured)**; visual
fidelity is closer to the concept sheet but still procedural (simple face, mitten hands, rigid joints).

## Definition of Done — status

| Requirement | Status | Evidence / notes |
|---|---|---|
| 10 playable levels with verified solutions | **Done** | `src/levels` tests: every level validates, solves within its echo limit with 3 stars, fails with the final run alone and with any single loop solo. E2E sweep completes all 10 in the browser. Minimum echo counts are argued, not exhaustively proven. |
| Deterministic echoes | **Done** | Integer simulation, seeded RNG, per-tick hashes; golden replays for all 10 levels + test chamber re-simulate bit-for-bit; seeded fuzzing with invariants after every tick. |
| All 12 puzzle components | **Done** | Plates, doors, timed switches (with cooldown), crates, cells, sockets, elevators, laser emitters/receivers, temporal gates, moving platforms, exit portals. Round 2 fixed QA-1 (deck walk surface is its real 1x1 extent; riders move with it in the same tick), QA-2 (an occupied temporal gate stays open until clear) and QA-3 (a lift never moves into a body; it waits in place). The three repros are now normal passing tests plus 14 edge-variant regressions, and the fuzzer no longer excuses them (20 000-tick, 4-seed run clean). |
| Nested loops (L08) | **Done** | `recursion: { delayTicks, copies }`; copies are ordinary echoes with their own divergence checks. Timeline now labels copies "Echo 1 ↻2" with an offset, dashed bar. |
| Timeline inspect / modify | **Done** | Track per echo, ruler, playhead, interaction markers, divergence highlights, scrubbing (3D view shows the scrubbed moment), pause, delete / hide / select loops, zoom, high-contrast palette option. |
| In-world indicators (which echo activates what, when) | **Done** | Numbered countdown badges above every object an echo will use in the next 4 s; walk-on badges (segmented ring) over pressure plates and ride-lifts; dashed ghost paths with second markers while Q is held. Walk-on badges and ghost paths come from a deterministic echo forecast run in a Web Worker; like the Q preview they assume the player stands still. |
| Cohesive premium visuals | **Mostly done** | Concept palette and language throughout. Round 2: new protagonist (white/ivory armour panels with gold edge glow, pauldrons, backpack time device, hair buns; 18 draw calls per character, ~8.6k triangles) and a panel-preserving cyan echo hologram; 9 wall modules per face, all authored decor types render (archway, 9 machinery variants, hologram, banner, abyss light), deeper backdrop. Still procedural: simple face, mitten hands, rigid joints, no textures on the character. |
| Polished animation / VFX | **Mostly done** | Procedural run/idle/carry/interact animation (round 2: corrected gait phase, breathing and weight-shift idle, reach/lift/place gestures, landing squash, head look toward the faced cell), echo manifest, rewind (screen-space + snapshot playback), divergence glitch, door/portal/laser effects, completion flash. Feel at 60 fps is unverified (see performance). |
| Audio | **Done** | Fully procedural SFX for every event class, ambience, adaptive music (menu / explore / solving / completion). No distinct sound yet for nested-loop copies. |
| Save / load | **Done** | Progress, best runs, settings, key bindings and in-progress echoes (saved on commit/delete, restored by Continue); corrupt/oversized saves load safely. |
| Browser tests pass | **Done** (see Tests below) | Smoke, flows, all-levels sweep, visual regression, perf probe. One flow test and two 3D baselines were updated for intended round-2 changes. |
| Performance targets (60 fps desktop / 30 fps low-end) | **Unverified** | Only measured under software rendering (SwiftShader, ~0.5 fps), which says nothing about real GPUs. L10 perf probe: 376 draw calls / 0.77 M triangles (high), 253 / 0.60 M (low). Triangles are up ~30% from round 2 art, draw calls about flat. The simulation itself costs ≤0.13 ms/tick. `npm run test:e2e:perf` must be run on real hardware. |
| Deployable static build | **Done** | `vite build` with `base: './'`; `dist/` works from any static host or sub-folder; three.js in its own cacheable chunk. |
| 60–120 min of play | **Unverified** | 10 chambers exist; par times total ~3 min of optimal play, so real play time depends on puzzle difficulty, which needs human playtests. |

## What changed in round 2 (gap-fix team)

Physics / gameplay (simulation changed deliberately; golden replays for L04, L05, L10 and one fuzz fingerprint
re-blessed — L04 completes one tick earlier, L05/L10 changed only mid-ride checkpoints)
- QA-1, QA-2, QA-3 fixed at the root (see the components row). New additive `SurfaceCell.clip` contract field and
  tick step 4b (riders carried in the same tick as their deck/lift); documented in `docs/architecture/contracts.md`.
- A lift can now pause mid-shaft (`state.held`) while someone straddles its edge.

Character
- New stylized protagonist following the concept turnaround (`src/graphics/animation/characterModel.ts`), shared
  geometry for player and echoes, 45 → 18 draw calls per character. Echo hologram keeps the panel pattern, shows
  only its nearest surface and stays cyan on bright floors.

Environment
- All authored decor types render (`src/graphics/environment/decor.ts`); 9 wall modules chosen per face, trims and
  caps; quadrant-plate floor tiles, framed grates, brass inlays; three tower bands, 70 spires, 9 clockwork rings,
  light shafts. L10 static kit 71 → 63 draw calls, backdrop 38 → 17.

UX / indicators
- Echo forecast (Web Worker) feeding Q-preview ghost paths and walk-on badges.
- `GameRenderer.setComfort()`: camera sensitivity scales wheel zoom and follow speed; reduced motion disables the new
  small camera shake (rewind, divergence, completion), shortens the intro fly-in (3.4 s → 1.1 s), damps rewind /
  glitch distortion and halves particle bursts.
- `?quality=` overrides are shown in Settings and lock the quality selector; an unknown value falls back to the
  saved preset (it used to force High).
- The attract replay pauses under menu sub-screens. A crate carried by a hidden echo is hidden with it.

Integration (director)
- `tests/e2e/flows.spec.ts` settings test boots without `?quality=` (the override now locks the selector) and gains
  a check of that lock. `tests/e2e/smoke.spec.ts` writes its review screenshots to the git-ignored `test-results/`
  instead of `docs/`. 3D visual baselines re-blessed after side-by-side review.
- Q-preview ghost-path ribbon widened (0.22 → 0.36 world units): the preview switches to the overview camera, where
  the thinner trail was hard to read.

## What changed in the v0.1 director's polish pass

Visual / camera
- **Closer follow camera** (distance 15–25 instead of 16–36): the characters now read as silhouettes at the
  concept-sheet scale instead of 50-pixel figures; wheel zoom still widens it.
- **Framing above docked UI:** the camera's projection is lifted so the subject is centred in the area above the
  timeline (6% normally, 16% with the expanded timeline). The timeline overview now fits the chamber's
  foreshortened footprint into that free area instead of a conservative bounding sphere, so chambers fill the view.
- **Main menu backdrop:** now a closer cinematic follow of the attract replay, shifted right of the title column
  (was a dark, distant overview).
- **Brass no longer reads olive:** horizontal brass (pillar caps, wall rails) mirrored the navy sky under the
  43° camera. The environment map gained a warm vaulted-ceiling band at 25–65° elevation, so brass reads gold and
  floors pick up the warm key.
- **Chromatic aberration** reduced from a full-frame 2 px fringe to a subtle corner-only effect (rewind and glitch
  effects unchanged).
- **Solid wall mass** behind chamber walls is plated as dark exterior decking instead of bare black foundation,
  so the overview reads as built structure.
- Replaced the deprecated `PCFSoftShadowMap` (console warning on every boot) with `PCFShadowMap`.

Gameplay readability / UI
- **In-world echo intent badges** (new `src/graphics/effects/echoIntents.ts`, fed from `TemporalGame.getTimeline()`
  through the new `GameRenderer.setTimeline()`; read-only).
- **Tutorial and hint cards step aside** during timeline inspect and temporal preview.
- **Level-complete card:** Best time now uses the same precision as Time (`0:04.77` / `0:04.77`).
- **Nested-loop copies** labelled and offset on the timeline; hiding an echo also hides its copies.
- Debug hook: `runSolution({ untilTick })` stops a verified solve mid-way (used for mid-solve screenshots).

## Known issues

1. Real-GPU performance and input feel unmeasured; intro fly-in timing, camera damping and the new camera shake
   were only judged from software-rendered frames. The first forecast (ghost paths / walk-on badges) appears after a
   few frames under SwiftShader; on a real GPU it should take ~100 ms (unmeasured).
2. Walk-on badges and ghost paths are predictions that assume the player stands still; they update as the player acts.
3. The head looks toward the faced cell, not the nearest interactable (`ActorVisual.setLookTarget` exists but the
   renderer does not call it yet).
4. A held lift (`state.held`) and a temporal gate held open by an occupant have no dedicated visual or audio cue
   (no `gateBlocked` event yet).
5. Character: simple face, mitten-like hands, rigid joints; ~8.6k triangles each (cost grows with echoes and
   nested-loop copies). Echoes render opaque with depth, so transparent effects directly behind an echo are hidden.
6. Some void-cell machinery (e.g. L01 pylons) is seen edge-on from the default camera; adjustable per decor `facing`.
7. The colour-blind-safe echo palette applies to the UI, not to 3D echo colours, badges or ghost paths.
8. No distinct sound for nested-loop copies.
9. The e2e suite takes ~26 minutes under software WebGL.
10. `docs/art-direction/screenshots/` still holds ~50 MB of superseded iteration screenshots (`v*-*`, `ui-*`,
    `levels-*`, `integration-*`): deleting them was blocked by this session's permissions and is left to a human.

## Recommended next milestones

1. **Real-hardware pass (highest priority):** run `npm run test:e2e:perf` and play on a mid-range and a low-end
   GPU; tune the quality presets to 60/30 fps (watch triangle counts with many echoes); tune camera damping,
   shake, intro length, forecast latency and movement feel.
2. **Human playtests** of L05–L09: tune hint timing, par times and difficulty; measure real play time against the
   60–120 min target; check that walk-on badges and ghost paths read clearly.
3. **Character fidelity:** skinned mesh or better joints, hands, face texture; wire `setLookTarget` to the nearest
   interactable.
4. **Feedback for blocking states:** held-lift visual, `gateBlocked` event with an audio cue; colour-blind palette
   for 3D echoes, badges and ghost paths; a sound for nested-loop copies.
5. **Repo hygiene:** delete the superseded screenshots listed in known issue 10.
6. **Input:** gamepad support behind the existing input resolver; key-remap e2e coverage.
7. **Bundle:** consider lazy-loading the harness/solution data used only by the attract replay.

## Tests run for this release (round 2, 2026-10-11)

- `npm run verify` (start and end of the director's round-2 pass): typecheck clean · Vitest 30 files,
  **451 passed, 0 expected-fail** (the QA-1/2/3 repros are ordinary tests now) · build OK.
- Full Playwright suite (`CI=1 E2E_PORT=4321 npx playwright test`, 25.7 min): **12 passed, 3 failed**, all from
  intended round-2 changes: the settings-persistence flow (a `?quality=low` URL override now locks the quality
  selector, so the test could not click "Medium") and the two L03 3D baselines (6% pixels different: new wall
  modules, archway, hologram, backdrop). All-10-levels sweep, smoke flow, Continue/restart, pause, timeline,
  level select, perf probe and UI visual tests passed.
- Fixes: settings test boots without the override and now also asserts the lock; all four 3D baselines re-blessed
  after side-by-side review (chamber and showcase still passed against the old look within tolerance, so they were
  re-blessed too). Re-run of `visual.spec.ts` + the settings test: **7/7 passed**.
- Perf probe (SwiftShader, not meaningful for real GPUs): L10 high 0.41 fps / 376 draw calls, low 0.48 fps / 253.
- Screenshot driver (`final-*.png`): all 10 chambers completed with their verified solutions in the real app, no
  page errors.

Exact commands and details: `docs/agent-progress/director-round2.md` (round 2) and
`docs/agent-progress/director-final.md` (v0.1).
