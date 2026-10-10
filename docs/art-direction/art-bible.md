# RECURSION Art Bible (v1, Graphics / Technical Art)

Visual target: `concept-sheet.png`. Screenshots of the live renderer are in `screenshots/`. `v1-*` is the
first pass, `v6-*` and `v7-*` are current. Capture more with `src/graphics/tools/capture-screenshots.mjs`.

## 1. Pillars of the look
1. **Monumental, warm interior; vast, cool exterior.** The chamber is lit warm (brass, amber lamps,
   ivory panels). The world around it is cool teal haze, fog, distant towers and clockwork rings.
2. **Readable first.** Gameplay objects use more emissive and more saturated colour than the
   architecture. The floor is calm (the stage), and objects are the show. Each signal colour is backed up
   by shape and animation.
3. **Controlled glow.** Bloom threshold is about 1.0 linear. Only emissives at intensity ≥ 1.2 bloom
   (cores, beams, portals, plates when pressed). Structural strips stay around 1.0–1.7.
4. **No grey-box.** Every module is beveled (RoundedBox/extrude/lathe), carries procedural PBR maps, and
   has a brass detail.

## 2. Colour language (`src/graphics/materials/palette.ts`)
| Role | Colour | Used for |
|---|---|---|
| Player / primary interaction | gold `#ffb347` | player halo, X-ray, suit device, chevrons, door seams |
| Echoes | cyan family `ECHO_TINTS` (6 hues, by index) | echo hologram, badge, halo, trail |
| Active machinery / powered | teal `#2fffcf` | pressed plates, powered sockets, lit receivers, open-door lamp, live wires |
| Hazard / invalid / divergence | coral `#ff5a4e` | locked-door lamp, empty socket, divergence glitch, failed interaction |
| Laser beams | hot red `#ff4636` | beams, emitter lens. Kept apart from cyan so beams never read as echoes |
| Advanced temporal | violet `#a46bff` | temporal gates with `allows: 'all'` |
| Architecture | ivory `#d9d4c7`, gunmetal `#2b3038`, brass `#c9963f`, warm-grey floor `#7f7b73` | kit |

Temporal gate colours follow `allows`: echoes = cyan/blue, player = gold/orange, all = violet/cyan.

## 3. Materials (`MaterialLibrary`, one per renderer, shared and never per-level)
Textures are procedural Canvas2D. Each set is painted as albedo, height and ORM (AO/rough/metal packed),
and the height map is turned into a normal map with a Sobel filter.
- `floorTile` / `floorGrate` (warm light through slots, emissive) / `floorEmblem` (brass chronometer ring).
  Tiles are mixed by hash (80/10/10), rotated in 90° steps, and given ±8% per-instance colour.
- `wallPanel`: gunmetal frame, a large painted ivory panel, a brass band, and a ribbed skirting. World-scale
  UVs (2 m repeat), so stacked modules tile seamlessly.
- `brass` (brushed, anisotropic streaks), `brassPolished` (clearcoat), `gunmetal` (micro panels and
  bolts), `ivory` (painted metal), `concrete`, `glass` (physical, clearcoat, transparent),
  `emissive(color, intensity)` (cached shared emissives).
- Environment: a custom PMREM gradient dome with warm strip lights on one side and a cool window panel on
  the other (`engine/rendering/environmentMap.ts`), so brass gets a warm/cool split highlight.

## 4. Lighting
- Key: warm directional `#ffcf9a` 3.6 from the front-left, PCF soft shadows fitted to the level bounds.
- Rim: cool directional `#5fb6ff` 1.1 from behind. Hemisphere fill: sky `#8ab4d8`, ground `#4a3420`, 0.55.
- Practicals: wall sconces, arch niches, lamps, pillars and observation windows register `KitLight`s. The
  renderer picks the top N by priority with ≥ 3.5 m spacing (N comes from quality: 2/5/8). The exit
  portal owns one cyan point light.
- Fog: `FogExp2(#24506e, 0.0085)`. The chamber is barely touched, and towers 100 m+ melt into the haze.
- ACES Filmic, exposure 0.9, sRGB output.

## 5. Post (`engine/rendering/PostFX.ts`, `graphics/shaders/grade.ts`)
RenderPass (half-float) → UnrealBloom (threshold 1.0, strength 0.42–0.48, half resolution) → OutputPass
(ACES + sRGB) → Grade → SMAA (high) or FXAA (low/medium).
The grade pass applies contrast 1.1, saturation 1.08, cool-shadow/warm-highlight split toning (0.18), a 0.5
vignette, and light grain. It also runs the temporal effects: rewind (barrel warp, swirl, radial smear,
cyan tint, scanlines), glitch (coral row displacement) and flash.

## 6. Environment kit (`graphics/environment/kit.ts`)
Wall height depends on the wall's class (computed from its neighbours), so the iso camera never loses the
player:
| Class | Rule | Module |
|---|---|---|
| back | open to the south only | 4 m paneled wall, cornice, brass trims, a pilaster between neighbours, and one of: cyan conduit strip, warm sconce, or **arch niche** |
| side | open east/west | same as back |
| partition | open north and south | 1.15 m gunmetal base, glass to 2.7 m, brass rails, warm strips |
| front | open to the north only | 0.62 m parapet, brass rail, amber strip |
Corners take their row neighbour's class first, then their column neighbour's.

Other modules:
- Floors: tiles sit on a 3.2 m foundation slab.
- Edges facing void or lower ground get a brass lip, a continuous amber strip and an amber under-glow.
- A keel with amber rings hangs under the chamber, so it reads as a floating platform.
- Pillar: a 4.6 m gunmetal shaft with ivory inset panels, gold light slits, and brass bands at base and
  capital.
- Railings: brass posts and two rails, glass infill, and a gunmetal kick plate with a gold strip. They
  connect toward neighbouring rails, walls and pillars.
- Ramps render as 7-step stairs with glowing gold nosings, extruded stringers and brass handrails.

Decor types (data-driven, unknown types are ignored):
- `conduit` and `observationWindow` are wall-mounted. If the decor is authored on the floor cell in front of
  a wall, it moves onto that wall.
- `ring`: on the camera side of the room it hangs horizontally under the platform. Otherwise it stands
  upright behind the wall line. It never blocks the play space.
- `lamp`: a brass post with a warm light.

Everything static is batched into InstancedMeshes per geometry/material (`Batcher`).

## 7. Backdrop (`graphics/environment/backdrop.ts`)
- Sky dome shader: navy zenith, teal horizon haze, a warm glow toward the sun azimuth, and faint cloud
  bands.
- Two cloud-sea layers below (scrolling fbm).
- 70 instanced towers (tapered hex prisms with lit-window emissive maps and spires), biased behind and to
  the sides of the camera.
- A colossal 7-arch arcade with cyan light bars behind the chamber, and walkway bridges with amber
  underlights.
- Three giant clockwork rings plus a horizontal halo ring under the chamber, rotating slowly.
- Four volumetric-looking light shafts (high and medium quality).
- Ambient motes, animated on the GPU: warm dust, rising cyan specks, and large distant embers.

## 8. Puzzle assets (`graphics/entities/*`): shape + motion + colour
| Kind | Shape | Motion and colour states |
|---|---|---|
| pressurePlate | gunmetal pad in a brass frame, concentric rings, corner chevrons | idle: cyan pulse. Pressed: pad sinks 6 cm, teal flare, expanding ring |
| door | ivory jambs, gunmetal/brass lintel, two ivory leaves with gunmetal insets and a gold seam plus lock ring | leaves slide with eased progress (interpolated). Lamp: coral = locked, teal = open, flashing gold = blocked. Seam brightens mid-travel |
| timedSwitch | pedestal, ivory head, dome button, ring of 12 segments | segments count down `remainingTicks`. Button: gold idle, teal flashing when on |
| crate | ivory core, gunmetal edge frame, brass corner caps, cyan lens on 4 faces, handles | carried overhead at 0.75× scale with a slight sway. Squash-and-settle on drop |
| energyCell | glass tube, bright core, brass caps and fins | hovers and spins when free. Seats into the receptacle cup. Tag gives hue |
| energySocket | stepped base, column, brass cup with prongs, glow ring | coral → teal when powered. Rotating arcs appear when powered |
| elevator | platform with emblem top and teal chevrons, brass lip, piston, corner guide rails with stop markers | y interpolated. Strips flash while moving |
| laserEmitter | yoke-mounted ivory housing, barrel with brass rings, lens | beam has a core plus halo with flowing shader, an impact flare, and periodic sparks |
| laserReceiver | ivory eye shell, polished brass ring, lens, orbiting arcs | dull red → teal when lit. Arcs speed up |
| temporalGate | gunmetal torus with brass ring and clock ticks, emissive bands | swirling portal shader. Power 0.22 closed / 1 open. Colours per `allows` |
| movingPlatform | hover slab with brass skirt and four brass thrusters | flickering orange jets (longer while moving). Bob and tilt. Dotted path lights |
| exitPortal | brass arch on a gunmetal back frame, dais, keystone gem | flowing light curtain, floor ring pulse, orbiting halo arcs, cyan point light. Dim gold when inactive |

Signal wires (`environment/wires.ts`) are floor-inlaid ribbons routed x then z from source to consumer.
They show a faint teal line when idle and bright streaming pulses toward the target when the source
output is true. Inverted wires use coral.

## 9. Characters (`graphics/animation/*`)
- Built from primitives: lathe torso, capsule limbs, rounded boots, skull and jaw, a hair cap, a fringe,
  a 3-segment high ponytail, and a backpack temporal device with a spinning ring. White and dark suit
  panels with gold piping, collar, belt and cuffs. Scaled 1.15× (about 2 m) so characters read against
  2 m tiles.
- Animation is procedural:
  - Run cycle is phase-locked to distance travelled, so feet don't slide (2.1 m per cycle at 4.8 m/s).
  - Idle breathing, weight shift and head look.
  - Carry pose holds the item overhead.
  - Interact reach (0.45 s), held-interact arm.
  - Ponytail secondary motion.
  - Heading turns with critical damping.
- Echoes use the same silhouette with the hologram shader (fresnel rim, scanlines, upward sweep band,
  dissolve-in from the feet). They also get a per-index tint, a floating hex number badge (always on top),
  a cyan ground halo and a fading ground ribbon trail. They dim once finished and flicker coral after a
  divergence.
- **X-ray silhouettes**: a fresnel capsule draws with `GreaterDepth` between the environment and the body
  (render order 1 vs 2), so the player and echoes stay readable behind doors, pillars and walls.

## 10. VFX (`graphics/effects/vfx.ts`), driven only by SimEvents
| Event | Effect |
|---|---|
| recordStart | 3 rising gold ground rings + gold spiral |
| rewind / chamberRestart | screen rewind distortion + implosion at every actor + echo re-manifest dissolve |
| echoSpawned | cyan ground ring + stacked column rings + burst |
| pickup / drop / interact | gold sparkles |
| interactFailed | coral sparks |
| divergence | coral glitch (screen and echo) + sparks + ring |
| doorOpen | gold seam sparks |
| plateDown | teal sparks |
| cellInserted / receiverLit / switchOn | teal or gold ring + burst |
| portalActivated | big cyan ring + sparks |
| levelComplete | gold flash + gold/cyan rings + 120-particle fountain |
| echoLimitReached | light glitch |

One pooled Points draw call for particles. Ring meshes are pooled (24).

## 11. Camera (`engine/rendering/CameraRig.ts`)
- 30° FOV perspective at a 43° pitch.
- Yaw follows `InputSampler` (45° steps, clockwise; step 1 = screen-up is north-east), plus a 14° visual
  bias for depth. Read it with `getCameraYawStep()`.
- Critically damped (SmoothDamp) follow with velocity lead, pulled 22% toward the chamber centre. Mouse
  wheel zoom 0.55–1.9×.
- `overview` frames the whole chamber. The `intro` fly-in (3.4 s, from high orbit) hands off to `follow`
  seamlessly.

## 12. Quality presets (`engine/rendering/quality.ts`)
| | low | medium | high |
|---|---|---|---|
| pixel ratio cap | 1 | 1.25 | 2 |
| shadows | off | 1024 PCFSoft | 2048 PCFSoft |
| bloom | off | 0.42 | 0.48 |
| AA | FXAA | FXAA | SMAA |
| particles | 35% | 70% | 100% |
| point lights | 2 | 5 | 8 |
| motes | 120 | 400 | 900 |
| light shafts / echo trails | off | on | on |

## 13. Performance notes
Draw calls, measured including the shadow and post passes (`renderer.stats()`):
- Test Chamber: about 380.
- Showcase with all 12 kinds and 3 characters: about 540.
- L03: about 370–430.

What keeps them down:
- Static kit is instanced.
- Character and entity meshes are merged per bone or group per material, with animated parts marked
  `dyn`.
- Echoes cast no shadows.

Everything level-scoped is disposed on `setLevel` (kit, backdrop, wires, motes, lights, visuals). Shared
materials and textures live for the renderer's lifetime.
