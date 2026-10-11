# Progress — Environment artist, round 2

Scope: `src/graphics/environment/**`, `src/graphics/materials/**` (no entity changes were needed). No
simulation, gameplay, level data or golden replays touched; decor stays render-only.

## Completed

1. **Every authored decor type renders** (`environment/decor.ts`, new). Previously ignored: `archway`, `machinery`,
   `hologram`, `banner`, `abyssLight`.
   - **archway**: a painted-ivory gateway arch with no sill, brass inner and outer trims, gunmetal plinths, ivory and
     gunmetal jambs with gold glow slits, and a brass keystone carrying `params.indicators` cyan lamps on both faces.
     It is sized to clear the door and lintel (crown at about 3.9 m).
   - **machinery**: all 9 variants (gears, clockwork, pistons, winch, archive, optics, vault, recursionEngine,
     coreDynamo). The mount depends on where the piece is authored, so it never blocks walkable space:
     - authored on a wall, or on a floor cell with a tall wall behind it: mounted on that wall, at most 0.7 m deep;
     - authored on a void cell: rises on a gunmetal pylon out of the abyss;
     - authored on open floor: the floor slab is replaced by a glazed, brass-rimmed **floor pit** with the mechanism
       spinning inside (the kit lowers that cell's foundation).
     Gears, hands, piston rods, drums and rings all animate.
   - **hologram**: a flush projector disc and an additive text panel (`params.text`/`color`, auto-fitted, with
     scanlines and flicker). It hovers low and nearly flat. An upright panel sat over the player in L01's attract
     run, so I laid it down.
   - **banner**: navy cloth with gold border, bands and a chronometer emblem (canvas texture, alpha-tested). It hangs
     on the wall behind, or on a freestanding brass frame where there is no tall wall (L10).
   - **abyssLight**: a two-layer coloured light column rising out of the depths, a bobbing glow crystal in brass
     rings, and a low-priority point light under the rim.
   - Existing types moved over: `ring` (now honours `params.color`), `conduit` (honours `color`), `lamp`, and
     `observationWindow`, which now honours `params.width` as a multi-arch window with a continuous sill.
   - A `planDecor` pre-pass records the wall faces and floor cells that decor claims. The kit leaves those clear: no
     wall module behind a window, and no floor slab over a pit.
2. **Wall modules** (`kit.ts`). Each open face of a tall wall gets a deterministic module, weighted by hash and
   never the same as the previous face in the run: plain (name plate and pips), conduit strip, observation window
   (arched, with a glowing "view out" shader), recessed panel, pipe cluster (valve, gauge), gold-banded ivory column,
   vent (louvres over a warm glow), arch niche, or sconce. Every face also gets a kick plate with a brass line and a
   crown moulding. Wall caps alternate a brass rail with a dim inspection plate and status pip.
   - The wall texture was redrawn as a single 2 m × 4 m module (frieze, tall ivory panel, brass band, slate lower
     panels, ribbed skirting). The library maps it one module per face. The old mapping put a texture seam in the
     middle of every face, which caused the "two white squares per wall" look.
3. **Floor**:
   - a new `floorPlate` variant (quadrant plates around a brass cross, about 20% of tiles);
   - grate tiles now read as inset hatches (raised brass frame and corner lugs);
   - a brass inlay along the foot of every tall wall;
   - the default tile's centre diamond is calmer, so repetition reads less;
   - exposed plinth faces down to a lower floor get a platform-edge module: recessed panel, brass stiles, kick plate
     and glow line (these were bare black before);
   - gunmetal buttress ribs under void edges.
4. **Backdrop** (`backdrop.ts`):
   - towers in three depth bands (96, was 70) plus a far field of 70 needle spires on the skyline;
   - a second, larger and deeper arcade tier, and flanking arcades on both sides (24 arches, was 7);
   - six flying gateway arches;
   - nine clockwork rings (was four): crossed gyroscope pairs, a 70 m gate ring half-sunk in the cloud sea, and two
     halos under the chamber;
   - seven light shafts (was four);
   - **depth-haze curtains**: three concentric fog bands between the layers;
   - a slow gyroscope under the chamber keel.
5. **Material pass**:
   - Brass albedo moved warmer and more orange (`#d08f3c`), with roughness 0.36. It had been mirroring the navy sky
     as olive on up-facing surfaces.
   - Roughness variation tightened (brushed 0.22 → 0.12, grime 0.10 → 0.06); env intensity 1.25 → 1.15.
   - Gunmetal slightly lighter and bluer (`0x9ba4b0`, env 1.1), so dark masses keep some specular instead of going
     black.
   - Painted ivory is used for arch bodies, columns and recessed panels against gunmetal frames and brass trim.
6. **Performance architecture**, which pays for all of the above:
   - `Batcher.cube` / `Batcher.tube`: unit geometries scaled per instance, so every plain box or tube of one
     material is one InstancedMesh. Shadow flags are set per material, which stops meshes splitting into cast and
     no-cast copies. Tubes use only two segment tiers.
   - `lib.glow`: one unlit material with per-instance colour (palette colour × intensity). All emissive trim in the
     kit collapses to one draw call per geometry.
   - `AnimatedParts` (new): instanced moving parts with per-frame matrices and a culling sphere that covers every
     pose. All rings, gears and pistons in a level cost a handful of draw calls. A clockwork ring used to cost 6.
   - `fxMaterials.ts` (new): instancing-aware shaft, abyss-beam, haze, window-pane and hologram shaders, tinted per
     instance.
   - Flush wall detail does not cast shadows.
   - `shapes.ts` (new): `WALL_H`, `DX/DZ`, the `face()` frame, arch shapes and `cellHash`. `kit.ts` re-exports the
     old names, so `entities/energy.ts` is unchanged.

## Draw calls and triangles, L10 (before → after)

| Measure | Before | After |
|---|---|---|
| Static kit draw calls (shadow casters), camera-independent counter | 71 (26) | **63 (23)** |
| Static backdrop draw calls | 38 | **17** |
| App, high quality, fixed tick 650, follow camera | 296 dc / 464k tris | **281 dc / 602k tris** |
| App, high quality, overview camera | 473 dc / 661k tris | **450 dc / 793k tris** |
| App, low quality, follow camera | 166 dc / 298k tris | **157 dc / 439k tris** |
| App, low quality, overview camera | 344 dc / 496k tris | **327 dc / 630k tris** |
| Perf probe (real-time autopilot, high / low) | 369–371 / 238–240 | 376 / 250 |

- Draw calls stay below the 500 high / 344 low ceiling and are lower at every fixed camera position.
- The perf-probe rows depend on which tick the real-time autopilot has reached when sampling, so they are not a
  like-for-like comparison. I counted visible meshes per group in the same preview frame: environment draws 73
  (mine) vs 77 (before).
- Triangles rise about 30% (more modules, gears, arches and spires). They are all instanced, and the frame-rate
  impact under SwiftShader was within noise (0.45 high / 0.45–0.58 low fps, against 0.46–0.47 / 0.38–0.39).

## Screenshot rounds (scratchpad `envart/`, compared with the concept sheet)

1. r1: walls broke up well, and archways, pits and hatches rendered. Problems: brass olive on top surfaces,
   holograms too faint, abyss beams invisible, floor diamond repetitive, plinth faces bare black.
2. r2: material and texture fixes, readable hologram, platform-edge module. Archway body still read olive, so I
   switched it to painted ivory as in the concept module.
3. r3: wall-top cap plates; hologram laid flat (it had occluded the player in the menu attract run); intro and
   overview checks of the backdrop.
4. Final: second halo moved lower into the haze, cap plates toned down, draw-call trimming, then L01, L06 and L10
   recaptured.

## Tests run (real results)

- `npm run verify`: typecheck clean; **30 files, 451 tests passed**; build OK.
- New `src/graphics/environment/kit.test.ts` (5 tests) checks that:
  - every campaign chamber builds within 80 static draw calls;
  - the backdrop stays at or under 20 draw calls;
  - every decor type the campaign authors adds geometry;
  - all 9 machinery variants build in all 3 mounts;
  - two builds give identical instance matrices.
- `tests/e2e/perf.spec.ts` alone, against a scratch build (results in the table).

## Notes for the director

- The 3D visual-regression baselines (`tests/e2e/visual.spec.ts-snapshots`) will differ. This is intended (walls,
  decor, floor, backdrop and materials all changed), so they need re-blessing after review.
- Kit lights per level dropped slightly (for example L10 23 → 17). Wall modules replaced some sconce slots. The
  renderer caps point lights per quality level anyway.
- Visual paths I didn't open for this pass: decor floor pits and pylons face their authored `facing`, so a few
  pieces (L01 abyss pylons facing east) are seen edge-on from the default camera. That is acceptable, and a level
  designer can change it with `facing`.
