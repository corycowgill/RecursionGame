/**
 * RECURSION colour language (see docs/art-direction/art-bible.md).
 * Values are sRGB hex; THREE.Color converts them to linear working space.
 *
 *   gold   = player / primary interaction     cyan   = echoes
 *   teal   = active machinery / powered       coral  = hazards, invalid, divergence
 *   violet = advanced temporal                white  = neutral UI
 */
export const PALETTE = {
  // Architecture
  ivory: 0xd9d4c7, // painted off-white metal panels
  ivoryShade: 0xa9a598,
  gunmetal: 0x2b3038, // dark structural metal
  gunmetalDeep: 0x171b21,
  slate: 0x4a525c, // floor stone/metal
  concrete: 0x6d6a64,
  brass: 0xc9963f, // brushed brass / gold trim
  brassDeep: 0x8a5f22,
  copper: 0xb8683a,

  // Light
  warmLight: 0xffc98a,
  warmLamp: 0xffb35c,
  coolAmbient: 0x5aa8e0,
  fog: 0x0f2236,
  fogFar: 0x1c4566,
  sky: 0x081422,

  // Signal colours (emissive)
  gold: 0xffb347,
  goldHot: 0xffd27a,
  cyan: 0x3fd8ff,
  cyanDeep: 0x1d8fd6,
  teal: 0x2fffcf,
  coral: 0xff5a4e,
  violet: 0xa46bff,
  white: 0xeaf6ff,
} as const;

/**
 * Echo identity palettes for the 3D view (holograms, halos, badges, ghost paths, trails). They are the SAME colours
 * as the UI timeline tracks (`src/ui/palette.ts`, Settings → Echo colours) so a track and its echo always match;
 * `palette.test.ts` asserts the two tables stay identical.
 *  - default: art direction (cyan → azure → violet → teal → lilac)
 *  - highContrast: Okabe–Ito colour-blind-safe set
 * The player is gold in both (a brighter yellow in high contrast).
 */
export type EchoPaletteName = 'default' | 'highContrast';

export interface EchoPaletteColors {
  player: number;
  echoes: readonly number[];
}

export const ECHO_PALETTES: Readonly<Record<EchoPaletteName, EchoPaletteColors>> = {
  default: { player: PALETTE.gold, echoes: [0x3fd9ff, 0x4f8dff, 0xa77bff, 0x37f0c8, 0xd08cff] },
  highContrast: { player: 0xffd400, echoes: [0x56b4e9, 0x009e73, 0xcc79a7, 0xe69f00, 0xf0f0f0] },
};

/** Default per-echo tints (kept for existing imports). */
export const ECHO_TINTS: readonly number[] = ECHO_PALETTES.default.echoes;

/** Unknown names (e.g. a corrupt setting) fall back to the default palette. */
export function echoPaletteOf(name: string | null | undefined): EchoPaletteColors {
  return name === 'highContrast' ? ECHO_PALETTES.highContrast : ECHO_PALETTES.default;
}

/** Tint of echo `index` (0-based; wraps around) in the given palette. */
export function echoTint(index: number, palette: EchoPaletteName = 'default'): number {
  const list = echoPaletteOf(palette).echoes;
  return list[((index % list.length) + list.length) % list.length] ?? PALETTE.cyan;
}

/** The player's identity colour (halo) in the given palette. */
export function playerTint(palette: EchoPaletteName = 'default'): number {
  return echoPaletteOf(palette).player;
}
