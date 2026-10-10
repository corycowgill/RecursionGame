# RECURSION — Release Notes (v0.1, director's release-candidate review)

Date: 2026-10-10 · Build: `npm run build` → static `dist/` (relative base path) · Reviewer: Game Director

This is an honest status report against the master plan's **Definition of Done**. "Verified" means checked by a
test that was run for this release; "unverified" means nobody has been able to measure it yet.

## Summary

The full game loop works end to end in the browser: boot → main menu (live attract replay) → level intro →
record / rewind / cooperate with echoes → timeline inspect and temporal preview → level complete → next chamber,
with pause, settings, level select, save/continue and procedural audio throughout. All 10 campaign chambers load,
render and complete with their verified solutions both headlessly and in the real app. The biggest open risks are
**real-GPU performance and feel (never measured)**, three known physics edge cases, and visual fidelity that is
cohesive and on-palette but still below the concept sheet's level of detail.

## Definition of Done — status

| Requirement | Status | Evidence / notes |
|---|---|---|
| 10 playable levels with verified solutions | **Done** | `src/levels` tests: every level validates, solves within its echo limit with 3 stars, fails with the final run alone and with any single loop solo. E2E sweep completes all 10 in the browser. Minimum echo counts are argued, not exhaustively proven. |
| Deterministic echoes | **Done** | Integer simulation, seeded RNG, per-tick hashes; golden replays for all 10 levels + test chamber re-simulate bit-for-bit; seeded fuzzing with invariants after every tick. |
| All 12 puzzle components | **Done, 3 known bugs** | Plates, doors, timed switches (with cooldown), crates, cells, sockets, elevators, laser emitters/receivers, temporal gates, moving platforms, exit portals. Open: QA-1 (rider can float over a pit next to a moving platform; reproducible in L05), QA-2 (temporal gate can close on an actor), QA-3 (brief clip into a departing lift). Each has an expected-failure repro test. |
| Nested loops (L08) | **Done** | `recursion: { delayTicks, copies }`; copies are ordinary echoes with their own divergence checks. Timeline now labels copies "Echo 1 ↻2" with an offset, dashed bar. |
| Timeline inspect / modify | **Done** | Track per echo, ruler, playhead, interaction markers, divergence highlights, scrubbing (3D view shows the scrubbed moment), pause, delete / hide / select loops, zoom, high-contrast palette option. |
| In-world indicators (which echo activates what, when) | **Partial → mostly done** | New this release: numbered badges with countdown rings above every object an echo will use in the next 4 s (switches, cells, sockets, crates, lifts…), flaring when the action lands. Not covered: walk-on objects (pressure plates) and ghost paths during Q preview. |
| Cohesive premium visuals | **Partial** | Matches the concept's palette and language (gold player / cyan echoes, brass + gunmetal kit, glowing conduits, clockwork rings, warm/cool lighting, controlled bloom, grade). Still built from procedural primitives: the character is simple next to the concept turnaround, walls are repetitive, decor vocabulary is limited (several authored decor types are not rendered yet). |
| Polished animation / VFX | **Mostly done** | Procedural run/idle/carry/interact animation, echo manifest, rewind (screen-space + snapshot playback), divergence glitch, door/portal/laser effects, completion flash. Feel at 60 fps is unverified (see performance). |
| Audio | **Done** | Fully procedural SFX for every event class, ambience, adaptive music (menu / explore / solving / completion). No distinct sound yet for nested-loop copies. |
| Save / load | **Done** | Progress, best runs, settings, key bindings and in-progress echoes (saved on commit/delete, restored by Continue); corrupt/oversized saves load safely. |
| Browser tests pass | **Done** (see Tests below) | Smoke, flows, all-levels sweep, visual regression, perf probe. |
| Performance targets (60 fps desktop / 30 fps low-end) | **Unverified** | Only measured under software rendering (SwiftShader, ~0.5 fps), which says nothing about real GPUs. Low preset cuts draw calls ~27%. The simulation itself costs ≤0.13 ms/tick. `npm run test:e2e:perf` must be run on real hardware. |
| Deployable static build | **Done** | `vite build` with `base: './'`; `dist/` works from any static host or sub-folder; three.js in its own cacheable chunk. |
| 60–120 min of play | **Unverified** | 10 chambers exist; par times total ~3 min of optimal play, so real play time depends on puzzle difficulty, which needs human playtests. |

## What changed in the director's polish pass

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

1. QA-1 / QA-2 / QA-3 physics edge cases (above).
2. Real-GPU performance and input feel unmeasured; the intro fly-in timing and camera damping were only judged
   from software-rendered frames.
3. `cameraSensitivity` and `reducedMotion` settings are saved but the renderer has no camera-shake/sensitivity API
   yet (reduced motion does shorten rewind playback and UI motion).
4. Hiding an echo filters it from the rendered state; a crate it carries falls back to its simulated position.
5. The attract replay keeps simulating under menu sub-screens (small CPU cost).
6. Several authored decor types (archway, machinery variants, hologram, banner, abyssLight) are ignored by the
   renderer.
7. `?quality=` URL overrides are not reflected in the Settings screen (it shows the saved preset).
8. The e2e suite takes ~20+ minutes under software WebGL.

## Recommended next milestones

1. **Real-hardware pass (highest priority):** run `npm run test:e2e:perf` and play on a mid-range and a low-end
   GPU; tune the quality presets to 60/30 fps; tune camera damping, intro length and movement feel.
2. **Fix QA-1/2/3** in gameplay/physics and flip their expected-failure repros to normal tests.
3. **Human playtests** of L05–L09 (the conceptual leaps): tune hint timing, par times and difficulty; measure
   real play time against the 60–120 min target.
4. **Art fidelity pass:** richer character model and materials, wall-module variation, render the remaining decor
   vocabulary, ghost paths for the Q preview, plate indicators for walk-on objects.
5. **Input:** gamepad support behind the existing input resolver; key-remap e2e coverage.
6. **Bundle:** consider lazy-loading the harness/solution data used only by the attract replay.

## Tests run for this release

- `npm run verify`: typecheck clean · Vitest 25 files, 406 passed + 3 expected-fail (open QA repros) · build OK.
- Full Playwright suite (`CI=1 E2E_PORT=4312 npx playwright test`, 23 min): all flow, smoke, all-10-levels and
  UI visual tests passed; the 4 3D visual baselines differed only by this pass's intended visual changes, were
  reviewed and re-blessed, and the visual suite then passed 6/6.
- `dist/` served from a sub-folder of a plain static server boots to the main menu with no errors.

Exact commands and details: `docs/agent-progress/director-final.md`.
