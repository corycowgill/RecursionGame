# RECURSION — Master Plan (v1.0, condensed from the product owner's brief)

Concept sheet: `docs/art-direction/concept-sheet.png` (character turnaround, gold player / cyan echoes,
modular environment kit, puzzle assets, VFX, PBR materials, temporal timeline UI). It is the visual target.

## Specs
| | |
|---|---|
| Genre | 3D temporal puzzle adventure |
| Camera | Three-quarter isometric / cinematic 3D |
| Visual style | AAA-inspired stylized sci-fi (warm gold/brass + cool cyan, monumental architecture) |
| Engine | Three.js + TypeScript (strict), Vite, Vitest, Playwright |
| Platform | Desktop browser (static web app) |
| Core mechanic | Record, rewind, cooperate with past selves (temporal echoes) |
| Scope | 10 handcrafted levels, 60–120 min |
| Perf | 60 FPS desktop, 30 FPS low-end; quality presets |

## Pillars
1. You are your own team — each completed loop becomes an echo replaying your inputs.
2. Time is programmable — solutions are built from coordinated recordings.
3. Every puzzle teaches something — introduce, reinforce, combine.
4. Visual clarity — always clear which echo does what, when.
5. Frictionless experimentation — rewind/reset/delete loops instantly.
6. Polish is a requirement — animation, lighting, sound, VFX, transitions, feedback.

## Core loop & rules
Chamber starts in a deterministic initial state. Player records actions (walk, interact, hold plates,
push/carry crates, wait). Rewind (R) resets the chamber to its initial state and the recording becomes an echo
that replays its recorded inputs alongside the player. Repeat until the per-level echo limit. Level completes
when the player reaches the exit with required conditions satisfied.
- All echoes share one simulation. World resets each loop. Echoes replay recorded *inputs*, not positions.
- Echoes interact physically; they are visually distinct (cyan variants, numbered accents); player is gold.
- Player may pause, rewind, inspect timeline, restart (Shift+R), delete loops.
- Paradox: if an echo's recorded action can't execute, it fails deterministically, the echo continues,
  the timeline marks the divergence. Never teleport/fabricate to preserve a recording.

## Temporal engine
- Fixed 60 Hz simulation, independent of render rate. Separate simulation / input / rendering / audio / UI / persistence.
- `PlayerInput { tick, moveX, moveY, interactPressed, interactHeld, actionPressed }`,
  `TemporalLoop { id, durationTicks, inputs }`.
- Determinism: fixed-point or quantized math, seeded RNG, stable entity IDs, documented ordering of
  simultaneous actions, no variable-delta physics, no render/audio influence, world-state hashes.
- Snapshots are derived caches for timeline scrubbing; invalidate on edit and recompute.
- Nested loops later (Level 8), deliberately.

## Controls
WASD move · E interact · Space context action · R end recording / create echo · Shift+R restart chamber ·
Tab timeline · Esc pause · Q temporal preview · 1–5 select echo. Movement is immediate and precise.

## Art direction
Stylized futuristic sci-fi: monumental architecture, layered machinery, glowing conduits, rotating rings
and clockwork, observation windows, deep backgrounds, atmospheric particles, holographic UI, reflective metal,
warm/cool contrast. Strong silhouettes, beveled edges, PBR with controlled roughness/metalness, AO, soft contact
shadows, tuned emissives, tone mapping, controlled bloom, color grading.
Avoid: gray-box, untextured primitives, cheap glowing cubes, excessive bloom, flat lighting, placeholder UI.
Color language: cyan = echoes, gold = player/primary interaction, teal = active machinery, coral/red = hazards
& invalid, violet = advanced temporal, white = neutral UI. Never color alone — reinforce with shape/animation/icons.
Camera: smooth tracking, minimal occlusion, zoom, puzzle overview mode, level-intro shots.

## Puzzle components (data-driven, shared sim interfaces, central interaction/ownership rules)
Pressure plates, locked doors, timed switches, movable crates, energy cells, energy sockets, elevators,
laser emitters, laser receivers, temporal gates, moving platforms, exit portals.

## Levels
1 First Echo (record/replay; one plate one door) · 2 Two Places at Once (simultaneous) · 3 The Relay
(object transport, timed coordination) · 4 The Lift (elevators, separation) · 5 Perfect Timing (sync) ·
6 Chain Reaction (multi-echo dependencies) · 7 Broken Sequence (failed interactions / divergence) ·
8 Recursive Machine (controlled nested loop) · 9 The Paradox Chamber (changing dependencies) · 10 The Core (finale).
Each: clear objective, known solution, machine-verifiable win, difficulty target, echo limit, test replay,
reset path, visual hints.

## Timeline UI (signature feature)
Track per echo, time ruler, playhead, interaction markers, color-coded tracks, scrubbing, visibility toggles,
divergence highlights, pause/inspect, delete/re-record loops, snapshot previews; in-world indicators of which
echo will activate which object and when.

## Audio
Rewind, echo creation, record start/end, divergence, plates, doors, energy cells, machinery, footsteps, UI,
completion, ambience; music transitions explore → solving → completion. Original/procedural only.

## Testing
Headless harness: load level, scripted inputs, loops, echo replay, win validation, deterministic hashes,
divergence detection, thousands of ticks. Known-good solution per level. Playwright smoke tests (launch, menu,
load, move, record, rewind, echo, complete, transition, pause, restart) + screenshots. Randomized fuzzing.

## Definition of done
10 playable levels with verified solutions; deterministic echoes; all components; timeline inspect/modify;
cohesive premium visuals; polished animation/VFX; audio; save/load; browser tests pass; perf targets;
deployable static build. Must feel like a real game, not an engineering demo.

## Coordination rules
Interfaces before parallel work; clear module ownership; no simultaneous edits to shared files; small tested
changes; never duplicate the temporal engine, bypass determinism, fake gameplay visually, or claim tests passed
without running them. Each agent reports completed work, files changed, tests run, outstanding issues, next tasks
in `docs/agent-progress/<role>.md`.
