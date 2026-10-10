# Character artist / animator: round 2

Owner: `src/graphics/animation/**` (`character.ts`, `actorVisual.ts`, new `characterModel.ts`) and
`src/graphics/shaders/hologram.ts`. No simulation, gameplay or golden replay changes.

## What changed

### Model (`characterModel.ts`, new)
The protagonist is rebuilt in code to follow the concept turnaround (front, side and back panel):

- **Proportions:** heroic stylized, about 1.75 m and 7 heads tall (chin at 1.52, crown at 1.75), long legs,
  narrow waist, a stylized bust and hips. `CHARACTER_SCALE` (1.15) is unchanged, so she stands about 2 m tall in world units as before.
- **Body:** a dark undersuit made of smooth parametric surfaces of revolution with elliptical cross-sections
  (pelvis, abdomen, ribcage, tapered limbs with calf and quad bulges).
- **Armour panels:** white and ivory panels are generated *on the same surface* as the body, offset outwards with
  a per-height outline, so they conform to the anatomy. Their edge walls are painted in the glowing gold/orange seam
  colour, which gives the concept's orange-outlined plates.
  - Chest plate, abdominal plate and V plate down to the crotch.
  - Back plate, side hip tassets and a rear hip skirt.
  - Front-outer thigh plates and rear thigh plates.
  - Shin guards and calf plates.
  - Upper-arm plates and gauntlets with gold cuffs.
  - Flank accent lines.
- **Shoulders, knees, feet and collar:** layered pauldrons (white dome, gold cap, glowing rim, dark under-plate),
  domed knee guards with orange caps, chunky sneaker boots (padded collar, white upper, ivory toe cap, thick sole,
  dark tread, orange swooshes and heel tab) and a high white collar.
- **Backpack:** a rounded shell with side rails and a circular temporal device: lathe housing, cyan glow ring,
  domed lens, gold clips, and three rotating glowing arc segments on the rim (`device` bone).
- **Head:** skull plus a separate face plane with a pointed chin, eyes (sclera and iris), brows, nose, mouth and ears,
  and a comm earpiece. Brown hair: a cap tilted back with a high hairline, flat side-swept bangs, side locks, two buns
  with messy spikes and gold ties, and a small nape lock on two bones for secondary motion.
- **Shapes:** lathe and parametric surfaces, capsules, `RoundedBoxGeometry`, spheres and tori. There are no
  hard-edged boxes left.

**Sharing and cost.** The geometry is built once per page, lazily, and shared by every Character, player and echoes alike.
Each bone is a single merged geometry with per-vertex `color` (albedo) and `paint` (roughness, metalness,
emissive, clearcoat) attributes. The player uses one `MeshPhysicalMaterial` patched with `onBeforeCompile` to read
`paint`. Echoes use one hologram material that derives its tone from the same attributes.

### Draw calls (measured with `renderer.info` in a turntable harness)

| | before | after |
|---|---|---|
| Body meshes = draw calls per character (player or echo) | 45 (player), 43 (echo) | **18** |
| Shadow-pass draws (player) | 45 | 18 |
| Materials per character | 6 (player) / 3 (echo) | 1 |
| Triangles per character | ~1.8k | ~8.6k |

`ActorVisual` still adds its 2 X-ray meshes, the halo and, for echoes, the badge sprite and trail, all unchanged.
The triangle count is the trade-off for the beveled, smooth shapes, and it is negligible for real GPUs. Character geometry is never
disposed because it is shared. `Character.dispose()` now releases only that character's material.

### Animation (`character.ts`, `actorVisual.ts`)

- **Rig:** an internal `body` group (pivot at the feet) carries the landing squash, so `ActorVisual`'s root scale is
  untouched. The bones are hips, spine, chest, device, neck, head, 2 hair bones, shoulders, elbows, thighs, knees and ankles.
- **Gait fixes (both bugs were inherited from round 1):**
  - The swing-leg knee folded during *stance*. It now folds during swing.
  - Arms swung in phase with the same-side leg. They now swing opposite it, with the chest counter-rotating against the pelvis.
  - Hip bob is now lowest at mid-stance.
  - The head counter-rotates so the gaze stays steady while running.
- **Weight shift:** when idle, the weight moves from one leg to the other every 3.5 to 7.5 s. The hip shifts and tilts, and the
  unweighted knee relaxes with the foot turned out.
- **Idle:** breathing (chest scale and arm sway) and an occasional glance to one side lasting about 1 to 1.7 s.
- **Head look:** `CharacterPose.lookYaw` / `lookPitch`. `ActorVisual` aims at the faced cell (actor centre + facing ×
  `PHYS.REACH`, where the sim probes for interactions) and pitches down while interacting. A new optional
  `ActorVisual.setLookTarget(worldPoint | null)` aims at an explicit interactable when the renderer wants that. The renderer
  does not call it yet; see the hand-off below.
- **Gestures:** chosen from `lastInteraction.kind`.
  - `reach` (use, action, fail, and holding a switch): right arm forward toward the target, chest turned.
  - `lift` (pickup, extract) and `place` (drop, insert): crouch, lean forward, both hands forward-low.
- **Carry:** both hands overhead. `carryAnchor` now *follows the hands* (palm midpoint + 0.13 m), so a picked-up item
  rises from waist height into the overhead hold as the carry weight blends in. The renderer still reads
  `carryAnchor` exactly as before.
- **Landing squash:** `ActorVisual` tracks vertical velocity. When a height change ends (lift arrival, step, ramp), it sends
  a `landing` impulse into a damped spring that squashes the body and bends the knees.
- **Secondary motion:** the hair lock reacts to speed and gait, and the device ring spins.
- **Determinism:** render-side idle randomness uses a seeded PRNG (seed = FNV hash of `actor.id`) instead of
  `Math.random()`, so preview screenshots are reproducible.

### Echo hologram (`hologram.ts`)
- **Tone and accents:** per-index cyan tint (`setTint` is unchanged). Tone comes from the vertex paint: the dark undersuit is a faint fill,
  white armour a brighter fill, and gold accents and seams near-white lines. The echo keeps the suit's panel layout, not
  just its outline.
- **Effects:** fresnel rim, fine scanlines, the upward data sweep, and flicker (rare short dips, phase from `uSeed`).
  There is also a subtle vertical dissolve: a dithered band of dropped fragments drifting up the body, plus a noisy manifest edge.
  Coral glitch on divergence is unchanged.
- **Clean silhouette:** the hologram now renders in the opaque queue with depth writes, so only the nearest surface
  shows and overlapping limbs no longer stack into a bright blob.
- **Saturation:** the blending is premultiplied: it adds the glow and veils what is behind by about 35%. Echoes stay saturated over the
  bright floor tiles, where additive blending washed them out to white.
- **Player:** keeps the gold accents, emissive gold seams and the gold halo.

### Public interface
Unchanged for the renderer. These are the existing members and the backward-compatible additions:
- `Character`: `root`, `materials`, `holograms`, `carryAnchor`, `deviceAnchor`, `update(dt, pose)`, `setHologram`,
  `setTint` and `dispose` are unchanged.
- `CharacterPose`: new optional fields `gestureKind`, `lookYaw`, `lookPitch` and `landing`.
- `Character`: new optional constructor `seed`, and a new `drawCalls` field.
- `ActorVisual`: same constructor and `update` signature, plus the optional `setLookTarget`.
- `createHologramMaterial`: same signature, with an optional `seed`.

## Visual iteration (screenshots in the scratchpad only)
- **Harness:** a turntable page outside the repo that renders the real `Character` with the game's environment map and
  tone mapping. It has front, side, back and 3/4 player views, two echo tints, a pose row (run, walk, carry with a crate,
  reach, lift, echo run), a head close-up mode, and per-character `renderer.info` draw counts.
- **Gameplay zoom:** checked in the real `graphics-preview.html` (chamber-follow, level03-follow, showcase-follow)
  with a copy of `capture-screenshots.mjs` that writes to the scratchpad.

| Round | Found | Fixed |
|---|---|---|
| r0 (baseline) | 45 draws, mannequin-like | Full rebuild |
| r1 | Dark neck gap above the collar, stick-like hair tail, coarse dissolve grain, harsh scanlines, blown-out lens | All five fixed |
| r1/r2 poses | Inverted knee phase and same-side arm swing (inherited) | Both fixed. Knee kick toned down, carry grip narrowed |
| r2 gameplay | Player reads well. Echo pale and showing white static | Saturation and dissolve band tuned |
| r3 | Back of the legs all dark compared with the concept | Rear hip skirt, rear thigh plates and calf plates added |
| r3 to r6 head close-ups | Cap too low, saw-tooth bangs, skin gap at the back of the head, beard-like tail | Cap tilt sign corrected, flat side-swept bangs, smaller nose, rounded nape lock |
| r7/r8 gameplay | Echo washed out on bright tiles | Premultiplied veil blending. Echo now a clean blue-glass silhouette |
| r9 poses | Confirmed run, carry, reach, lift and echo run | None needed |

**Compared with the concept sheet:**
- **Matches:** silhouette, white-over-dark segmentation, orange seams, pauldrons, gauntlets, knee guards, chunky
  sneakers, the circular backpack device and two hair buns all read at close zoom. At gameplay zoom the player is
  clearly the white-suited, gold-accented heroine with a glowing backpack.
- **Gaps that remain:** the face is simple (stylized primitives, no texture), the hands are mitten-style blocks, and there is
  no cloth or skinning, so the joints are rigid segments.

## Verification
- **Full verify:** `npm run verify` is green: typecheck clean, 25 test files with 421 tests passed, and `vite build` succeeds. While other
  agents were editing, it was briefly red on `src/graphics/environment/kit.ts` / `decor.ts`. That was outside my ownership and cleared once they finished.
- **Expected-fail tests:** the QA repros are untouched.
- **Golden replays:** not regenerated. No simulation change.
- **Visual baselines:** e2e visual baselines that include characters will differ, because the character's look changed on purpose. The director owns the e2e suite and its baselines.

## Hand-off notes
- **Renderer:** to make the head track the *actual* nearest interactable instead of the faced cell, call
  `actorVisual.setLookTarget(worldPos)` from `GameRenderer.syncActors`, for example with the entity behind the player's
  interact prompt. Pass `null` to clear it.
- **VFX:** `character.deviceAnchor` sits at the face of the rotating device ring, the spot for any backpack glow or
  rewind effect.
