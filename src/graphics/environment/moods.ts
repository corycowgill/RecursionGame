/**
 * CHAMBER MOODS (round 5): one lighting mood and accent per campaign chamber, chosen data-driven from the level id.
 *
 * The art bible's rule stays: warm, monumental interior; vast, cool-to-coloured exterior; gameplay colours untouched.
 * A mood only changes the *stage*: key / rim / fill light colour, fog tint, sky and cloud sea, backdrop accents
 * (tower crowns, arcade light bars, clockwork-ring glow, light shafts), practical-lamp tint, the display grade, and
 * the shared material variant (brass tint and polish, patina, grime, chrome). It never changes a gameplay emissive:
 * the gold player, the echo palette, teal machinery, coral hazards and red beams are drawn with their own fixed
 * colours (`palette.ts`), and `moods.test.ts` checks that no mood accent drifts into the coral / hazard hue range.
 *
 * Wings (the campaign's story arc, see docs/game-design/levels.md):
 *   L01–L02  Dawn Atrium      dawn gold through the old east wing; oxidised brass, light grime
 *   L03–L04  Chronometry Lab  cool cyan laboratory light; clean painted panels, satin metal
 *   L05–L06  Machine Hall     amber furnace light, smoky haze; brushed brass, heavy wear
 *   L07–L09  Paradox Wing     violet dusk; dark lacquered metal, aged gold leaf
 *   L10      The Core         white-hot; polished chrome-gold, no wear
 * Unknown ids (test chamber, showcase, user levels) get DEFAULT_MOOD, which is exactly the pre-round-5 look.
 *
 * Read-only from level data: the only input is `level.id` (and `order` as a fallback). Nothing here feeds back into
 * the simulation, and the table is pure data (unit-tested without WebGL).
 */

/** sRGB hex colour (THREE.Color converts to linear). */
type Hex = number;
/** Display-space RGB 0..1, used as is by the grade pass (it runs after tone mapping and sRGB encoding). */
export type RGB = readonly [number, number, number];

/** Display-space triple from a hex literal (no colour-space conversion). */
const rgb = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export interface MaterialMood {
  /** Multiplies the brushed-brass albedo map (white = authored brass). */
  brassTint: Hex;
  /** Roughness factor on the brass roughness map (1 = authored; lower = more polished). */
  brassRough: number;
  /** Multiplies gunmetal (structural dark metal) albedo. */
  gunmetalTint: Hex;
  /** Multiplies the painted wall-panel and ivory albedo. */
  panelTint: Hex;
  /** Multiplies the floor tile albedo (all floor variants). */
  floorTint: Hex;
  /** 0..1 verdigris / oxidation on brass in cavities and blotches (world-space mask, no texture). */
  patina: number;
  /** Patina colour (desaturated green-blue: never teal-saturated, which is the "powered" signal). */
  patinaColor: Hex;
  /** 0..1 grime: darker, rougher blotches and vertical drip streaks on walls, scuffs on floors. */
  grime: number;
  /** 0..1 pulls brass toward polished chrome / white gold (desaturated, brighter, smoother). */
  chrome: number;
}

export interface ChamberMood {
  /** Wing / mood name (debug, docs). */
  name: string;
  exposure: number;
  key: { color: Hex; intensity: number };
  /**
   * Direction toward the sun (world x east, y up, z south; normalised by the renderer). Absent = the original
   * front-left key placement (DEFAULT_MOOD). Keep y >= ~0.6 so long shadows never swallow the play space, and avoid a sun from the north (-z) at
   * 40–55° elevation: horizontal floors and brass then mirror it straight into the 43° iso camera (glare).
   */
  keyFrom?: readonly [number, number, number];
  rim: { color: Hex; intensity: number };
  hemi: { sky: Hex; ground: Hex; intensity: number };
  /** scene.environmentIntensity (metal reflections). */
  env: number;
  fog: { color: Hex; density: number };
  background: Hex;
  /** Practical lamps (sconces, niches, lamp posts): their colour is mixed toward `tint` by `mix`, intensity x scale. */
  practical: { tint: Hex; mix: number; scale: number };
  grade: { warm: RGB; cool: RGB; split: number; saturation: number; contrast: number; vignette: number };
  sky: { zenith: Hex; horizon: Hex; below: Hex; sun: Hex; sunDir: readonly [number, number, number]; sunStrength: number };
  clouds: { low: Hex; lowHi: Hex; high: Hex; highHi: Hex };
  /** Depth-haze curtains, near → far. */
  haze: readonly [Hex, Hex, Hex];
  /** Backdrop accent glow: tower crowns, arcade light bars, the main clockwork-ring glow. */
  accent: Hex;
  /** Secondary ring glow (the crossing gyroscope rings), usually gold for the warm/cool split. */
  accent2: Hex;
  /** Third ring glow (the high gyroscope partner). */
  accent3: Hex;
  /** Tower window emissive tint (multiplies the lit-window atlas). */
  windows: Hex;
  /** Light shafts: warm and cool shaft colours (`coolFar`: the great shafts through the far arcade). */
  shafts: { warm: Hex; cool: Hex; coolFar?: Hex };
  material: MaterialMood;
}

const NEUTRAL_MATERIAL: MaterialMood = {
  brassTint: 0xffffff,
  brassRough: 1,
  gunmetalTint: 0x9ba4b0,
  panelTint: 0xffffff,
  floorTint: 0xffffff,
  patina: 0,
  patinaColor: 0x6f9a8c,
  grime: 0,
  chrome: 0,
};

/** The pre-round-5 look (test chamber, showcase, unknown levels): every value equals the old hard-coded one. */
export const DEFAULT_MOOD: ChamberMood = {
  name: 'Default',
  exposure: 0.9,
  key: { color: 0xffcf9a, intensity: 3.6 },
  rim: { color: 0x5fb6ff, intensity: 1.1 },
  hemi: { sky: 0x8ab4d8, ground: 0x4a3420, intensity: 0.55 },
  env: 0.6,
  fog: { color: 0x24506e, density: 0.0085 },
  background: 0x081422,
  practical: { tint: 0xffb35c, mix: 0, scale: 1 },
  grade: { warm: [1.0, 0.86, 0.68], cool: [0.62, 0.82, 1.0], split: 0.18, saturation: 1.08, contrast: 1.1, vignette: 0.5 },
  sky: { zenith: 0x050c18, horizon: 0x2a5f80, below: 0x0b2236, sun: 0xffa45a, sunDir: [-0.6, 0.12, -0.8], sunStrength: 0.6 },
  clouds: { low: 0x0f3550, lowHi: 0x5aa6cf, high: 0x16466a, highHi: 0x9fd6f0 },
  haze: [0x1f4a68, 0x2a5f80, 0x2f6a8c],
  accent: 0x3fd8ff,
  accent2: 0xffb347,
  accent3: 0xa46bff,
  windows: 0xffffff,
  shafts: { warm: 0xffc98a, cool: 0x7cc8ff, coolFar: 0x9fd8ff },
  material: NEUTRAL_MATERIAL,
};

const mood = (name: string, over: Omit<Partial<ChamberMood>, 'material'> & { material?: Partial<MaterialMood> }): ChamberMood => ({
  ...DEFAULT_MOOD,
  ...over,
  name,
  material: { ...NEUTRAL_MATERIAL, ...over.material },
});

// ---------------------------------------------------------------- wings

const DAWN_MATERIAL: Partial<MaterialMood> = { brassTint: 0xf2e4c8, brassRough: 1.08, patina: 0.5, grime: 0.28, panelTint: 0xfff6ea, floorTint: 0xfff3e2 };
const LAB_MATERIAL: Partial<MaterialMood> = { brassTint: 0xf4f0ea, brassRough: 0.9, patina: 0, grime: 0.08, chrome: 0.22, panelTint: 0xf2f7ff, floorTint: 0xeef3f8, gunmetalTint: 0x98a6b6 };
const HALL_MATERIAL: Partial<MaterialMood> = { brassTint: 0xffe2b8, brassRough: 1.12, patina: 0.12, grime: 0.5, panelTint: 0xf6e8d6, floorTint: 0xf2e2cc, gunmetalTint: 0x9a9890 };
const PARADOX_MATERIAL: Partial<MaterialMood> = { brassTint: 0xffe8c8, brassRough: 0.95, patina: 0.18, grime: 0.2, panelTint: 0xf0f0f6, floorTint: 0xeeeef2, gunmetalTint: 0x948fa8 };

/**
 * Campaign moods keyed by the level-id prefix ("L01" …). Each chamber differs a little inside its wing (sun height,
 * haze, accent), so consecutive chambers never look identical.
 */
export const CHAMBER_MOODS: Readonly<Record<string, ChamberMood>> = {
  // ------------------------------------------------ Dawn Atrium (oxidised old wing, low gold sun)
  L01: mood('Dawn Atrium · first light', {
    exposure: 0.92,
    key: { color: 0xffbb76, intensity: 3.9 },
    keyFrom: [0.78, 0.6, 0.22],
    rim: { color: 0x86b4ff, intensity: 1.0 },
    hemi: { sky: 0xa6b8cc, ground: 0x5e3c1e, intensity: 0.58 },
    fog: { color: 0x4a5866, density: 0.0078 },
    background: 0x141824,
    practical: { tint: 0xffb862, mix: 0.3, scale: 1.05 },
    grade: { warm: rgb(0xffd090), cool: rgb(0xa8c6ff), split: 0.27, saturation: 1.07, contrast: 1.08, vignette: 0.5 },
    sky: { zenith: 0x0c1428, horizon: 0xc98a52, below: 0x2a2632, sun: 0xffb25e, sunDir: [-0.55, 0.06, -0.83], sunStrength: 1.1 },
    clouds: { low: 0x3a3440, lowHi: 0xe0a46a, high: 0x4a4250, highHi: 0xffc890 },
    haze: [0x4a4a52, 0x6a5a52, 0x7a6450],
    accent: 0xffbf6a,
    accent2: 0x7fd4ff,
    accent3: 0xffd9a0,
    windows: 0xffd9a8,
    shafts: { warm: 0xffbe78, cool: 0xa8c8ff },
    material: DAWN_MATERIAL,
  }),
  L02: mood('Dawn Atrium · east gallery', {
    exposure: 0.92,
    key: { color: 0xffcc92, intensity: 3.75 },
    keyFrom: [0.62, 0.7, 0.3],
    rim: { color: 0x7cb2ff, intensity: 1.1 },
    hemi: { sky: 0x9cb8d2, ground: 0x583a20, intensity: 0.57 },
    fog: { color: 0x3e5464, density: 0.008 },
    background: 0x10182a,
    practical: { tint: 0xffb862, mix: 0.25, scale: 1 },
    grade: { warm: rgb(0xffd8a4), cool: rgb(0xa2c8ff), split: 0.22, saturation: 1.07, contrast: 1.09, vignette: 0.5 },
    sky: { zenith: 0x0a1630, horizon: 0xb0885e, below: 0x24283a, sun: 0xffbc70, sunDir: [-0.35, 0.16, -0.92], sunStrength: 0.95 },
    clouds: { low: 0x2e3a48, lowHi: 0xd0a070, high: 0x3c4658, highHi: 0xf4cc9a },
    haze: [0x404c58, 0x5e5a5a, 0x6e6658],
    accent: 0xffc070,
    accent2: 0x6fd0ff,
    accent3: 0xffd9a0,
    windows: 0xffe0b8,
    shafts: { warm: 0xffc482, cool: 0x9cc8ff },
    material: { ...DAWN_MATERIAL, patina: 0.42, grime: 0.24 },
  }),
  // ------------------------------------------------ Chronometry Lab (cool cyan, clean)
  L03: mood('Chronometry Lab · relay floor', {
    exposure: 0.9,
    key: { color: 0xf0eadf, intensity: 3.4 },
    keyFrom: [-0.3, 0.92, 0.22],
    rim: { color: 0x58c8ff, intensity: 1.45 },
    hemi: { sky: 0x92c8ea, ground: 0x34404a, intensity: 0.6 },
    env: 0.68,
    fog: { color: 0x1a5068, density: 0.0088 },
    background: 0x061624,
    practical: { tint: 0xe8f2ff, mix: 0.35, scale: 0.95 },
    grade: { warm: rgb(0xffe6c4), cool: rgb(0x96dcff), split: 0.15, saturation: 1.04, contrast: 1.1, vignette: 0.48 },
    sky: { zenith: 0x031220, horizon: 0x2690b0, below: 0x08283a, sun: 0x9ee6ff, sunDir: [-0.6, 0.14, -0.8], sunStrength: 0.35 },
    clouds: { low: 0x0c3a52, lowHi: 0x5ac0e0, high: 0x12506e, highHi: 0xa6e8ff },
    haze: [0x18506a, 0x22688a, 0x2a7898],
    accent: 0x52e4ff,
    accent2: 0xffb347,
    accent3: 0x8fd8ff,
    windows: 0xcdeeff,
    shafts: { warm: 0xffe0b8, cool: 0x7cd8ff },
    material: LAB_MATERIAL,
  }),
  L04: mood('Chronometry Lab · freight stack', {
    exposure: 0.9,
    key: { color: 0xece8e2, intensity: 3.45 },
    keyFrom: [0.25, 0.93, 0.25],
    rim: { color: 0x4cc0f0, intensity: 1.5 },
    hemi: { sky: 0x86c0e4, ground: 0x303a44, intensity: 0.58 },
    env: 0.66,
    fog: { color: 0x174a62, density: 0.009 },
    background: 0x05121e,
    practical: { tint: 0xdcecff, mix: 0.3, scale: 1 },
    grade: { warm: rgb(0xffe2bc), cool: rgb(0x8ed4ff), split: 0.16, saturation: 1.05, contrast: 1.11, vignette: 0.5 },
    sky: { zenith: 0x02101c, horizon: 0x1f80a0, below: 0x062232, sun: 0x8edcff, sunDir: [0.5, 0.1, -0.86], sunStrength: 0.4 },
    clouds: { low: 0x0a3248, lowHi: 0x4cb0d4, high: 0x10465e, highHi: 0x94dcf6 },
    haze: [0x164a62, 0x1e6080, 0x267090],
    accent: 0x46d8f8,
    accent2: 0xffb347,
    accent3: 0x7cc8ff,
    windows: 0xc4e8ff,
    shafts: { warm: 0xffdcb0, cool: 0x6cd0ff },
    material: { ...LAB_MATERIAL, grime: 0.14, chrome: 0.16 },
  }),
  // ------------------------------------------------ Machine Hall (amber furnace light, smoky)
  L05: mood('Machine Hall · ferry deck', {
    exposure: 0.9,
    key: { color: 0xffb670, intensity: 3.85 },
    keyFrom: [-0.82, 0.62, 0.05],
    rim: { color: 0x6aa6e0, intensity: 0.95 },
    hemi: { sky: 0xa69a8a, ground: 0x6a3c14, intensity: 0.56 },
    fog: { color: 0x463626, density: 0.0092 },
    background: 0x140e0a,
    practical: { tint: 0xffb862, mix: 0.4, scale: 1.12 },
    grade: { warm: rgb(0xffcf90), cool: rgb(0x9cbcf0), split: 0.25, saturation: 1.1, contrast: 1.12, vignette: 0.54 },
    sky: { zenith: 0x120c0c, horizon: 0x9a5c2a, below: 0x22160e, sun: 0xff9a40, sunDir: [-0.7, 0.08, -0.7], sunStrength: 0.9 },
    clouds: { low: 0x2a1e16, lowHi: 0xb0703a, high: 0x3a2a1e, highHi: 0xd8964e },
    haze: [0x40301e, 0x5a4026, 0x6a4c2c],
    accent: 0xffb24e,
    accent2: 0x6fc8ff,
    accent3: 0xffcf7a,
    windows: 0xffc488,
    shafts: { warm: 0xffb060, cool: 0x9cbce8 },
    material: HALL_MATERIAL,
  }),
  L06: mood('Machine Hall · beam forge', {
    exposure: 0.88,
    key: { color: 0xffc286, intensity: 3.8 },
    keyFrom: [-0.72, 0.66, -0.05],
    rim: { color: 0x70a8e8, intensity: 1.05 },
    hemi: { sky: 0x9a98a0, ground: 0x5e3818, intensity: 0.55 },
    fog: { color: 0x3c3428, density: 0.0094 },
    background: 0x100e0c,
    practical: { tint: 0xffb460, mix: 0.35, scale: 1.08 },
    grade: { warm: rgb(0xffd59c), cool: rgb(0x98bcf4), split: 0.22, saturation: 1.08, contrast: 1.13, vignette: 0.55 },
    sky: { zenith: 0x0e0c10, horizon: 0x86562e, below: 0x1e1610, sun: 0xffa850, sunDir: [0.55, 0.1, -0.83], sunStrength: 0.8 },
    clouds: { low: 0x261e18, lowHi: 0x9c6a40, high: 0x342a22, highHi: 0xc89058 },
    haze: [0x3a3020, 0x524028, 0x604a30],
    accent: 0xffb454,
    accent2: 0x62c4ff,
    accent3: 0xffd08a,
    windows: 0xffcc94,
    shafts: { warm: 0xffb86a, cool: 0x94b8ec },
    material: { ...HALL_MATERIAL, grime: 0.45, patina: 0.16 },
  }),
  // ------------------------------------------------ Paradox Wing (violet dusk, lacquer and gold)
  L07: mood('Paradox Wing · broken sequence', {
    exposure: 0.9,
    key: { color: 0xffe0cc, intensity: 3.6 },
    keyFrom: [-0.8, 0.72, -0.1],
    rim: { color: 0xa080ff, intensity: 1.5 },
    hemi: { sky: 0x8c86c0, ground: 0x3a2842, intensity: 0.5 },
    fog: { color: 0x2e2650, density: 0.0092 },
    background: 0x0a0818,
    practical: { tint: 0xf4dcff, mix: 0.25, scale: 1 },
    grade: { warm: rgb(0xffd6b4), cool: rgb(0xb4a8ff), split: 0.22, saturation: 1.07, contrast: 1.11, vignette: 0.54 },
    sky: { zenith: 0x08061a, horizon: 0x6448a6, below: 0x161032, sun: 0xffa8c8, sunDir: [-0.6, 0.1, -0.8], sunStrength: 0.7 },
    clouds: { low: 0x1e1a40, lowHi: 0x7a62c0, high: 0x2a2454, highHi: 0xb4a0f0 },
    haze: [0x282450, 0x3a3270, 0x463c84],
    accent: 0xb084ff,
    accent2: 0xffb347,
    accent3: 0x7fd4ff,
    windows: 0xd8c4ff,
    shafts: { warm: 0xffc8a8, cool: 0xa898ff },
    material: PARADOX_MATERIAL,
  }),
  L08: mood('Paradox Wing · recursive machine', {
    exposure: 0.9,
    key: { color: 0xffe4d4, intensity: 3.55 },
    keyFrom: [0.75, 0.74, -0.1],
    rim: { color: 0x8c7cff, intensity: 1.6 },
    hemi: { sky: 0x8486c4, ground: 0x32284a, intensity: 0.5 },
    fog: { color: 0x262658, density: 0.0094 },
    background: 0x08081c,
    practical: { tint: 0xe8dcff, mix: 0.25, scale: 1 },
    grade: { warm: rgb(0xffdabc), cool: rgb(0xa8acff), split: 0.22, saturation: 1.06, contrast: 1.12, vignette: 0.55 },
    sky: { zenith: 0x06061c, horizon: 0x4c4cae, below: 0x10103a, sun: 0xd0a8ff, sunDir: [0.45, 0.14, -0.88], sunStrength: 0.65 },
    clouds: { low: 0x1a1a46, lowHi: 0x6466c8, high: 0x24245c, highHi: 0xa8a8f8 },
    haze: [0x24245a, 0x32347a, 0x3c408c],
    accent: 0x9c8cff,
    accent2: 0xffb347,
    accent3: 0xc8a0ff,
    windows: 0xccc8ff,
    shafts: { warm: 0xffd0b4, cool: 0x9ca0ff },
    material: { ...PARADOX_MATERIAL, gunmetalTint: 0x8e90aa },
  }),
  L09: mood('Paradox Wing · paradox chamber', {
    exposure: 0.9,
    key: { color: 0xffdcc8, intensity: 3.6 },
    keyFrom: [-0.6, 0.78, 0.15],
    rim: { color: 0xb07cff, intensity: 1.65 },
    hemi: { sky: 0x9086c6, ground: 0x3c2846, intensity: 0.5 },
    fog: { color: 0x32224e, density: 0.0096 },
    background: 0x0c0618,
    practical: { tint: 0xf0d4ff, mix: 0.25, scale: 1 },
    grade: { warm: rgb(0xffd2b4), cool: rgb(0xbca4ff), split: 0.24, saturation: 1.08, contrast: 1.12, vignette: 0.56 },
    sky: { zenith: 0x0a041a, horizon: 0x7444a8, below: 0x1a0c32, sun: 0xd6a0ff, sunDir: [-0.2, 0.12, -0.97], sunStrength: 0.8 },
    clouds: { low: 0x221840, lowHi: 0x8a5cc4, high: 0x2e2056, highHi: 0xc4a0f4 },
    haze: [0x2c2050, 0x402e70, 0x4c3884],
    accent: 0xbc80ff,
    accent2: 0xffb347,
    accent3: 0x80d8ff,
    windows: 0xe0c0ff,
    shafts: { warm: 0xffc4a8, cool: 0xb094ff },
    material: { ...PARADOX_MATERIAL, patina: 0.22, grime: 0.24 },
  }),
  // ------------------------------------------------ The Core (white-hot, polished, pristine)
  L10: mood('The Core', {
    exposure: 0.93,
    key: { color: 0xfff1e2, intensity: 3.9 },
    keyFrom: [0.15, 0.97, 0.2],
    rim: { color: 0xc4e4ff, intensity: 1.5 },
    hemi: { sky: 0xc4d8ec, ground: 0x4c4440, intensity: 0.66 },
    env: 0.72,
    fog: { color: 0x6c8aa0, density: 0.0078 },
    background: 0x18222e,
    practical: { tint: 0xfff0dc, mix: 0.45, scale: 1.05 },
    grade: { warm: rgb(0xfff0dc), cool: rgb(0xc4dcff), split: 0.12, saturation: 1.02, contrast: 1.15, vignette: 0.56 },
    sky: { zenith: 0x101c2c, horizon: 0xb6cede, below: 0x3a4a5a, sun: 0xffffff, sunDir: [-0.2, 0.2, -0.96], sunStrength: 1.0 },
    clouds: { low: 0x4a5a68, lowHi: 0xd8e6f0, high: 0x5c6c7a, highHi: 0xf4fbff },
    haze: [0x5a7084, 0x7a90a2, 0x90a6b6],
    accent: 0xe4f6ff,
    accent2: 0xffc870,
    accent3: 0xbfe6ff,
    windows: 0xf4f8ff,
    shafts: { warm: 0xfff0d8, cool: 0xdcefff },
    material: { brassTint: 0xfff6e8, brassRough: 0.6, patina: 0, grime: 0, chrome: 0.6, panelTint: 0xfafcff, floorTint: 0xf6f8fa, gunmetalTint: 0xa6b0bc },
  }),
};

/** The mood of a level: by its id prefix ("L07-broken-sequence" → L07), else by campaign order, else the default. */
export function moodFor(level: { id: string; order?: number } | null | undefined): ChamberMood {
  if (!level) return DEFAULT_MOOD;
  const m = /^L(\d{2})/.exec(level.id);
  if (m) return CHAMBER_MOODS[`L${m[1]}`] ?? DEFAULT_MOOD;
  return DEFAULT_MOOD;
}
