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

/** Per-echo hue variations (all within the cyan family, distinct enough to tell apart). */
export const ECHO_TINTS: readonly number[] = [0x3fd8ff, 0x5c8dff, 0x34f0e0, 0x8f7dff, 0x52c2ff, 0x2fe6a8];

export function echoTint(index: number): number {
  return ECHO_TINTS[((index % ECHO_TINTS.length) + ECHO_TINTS.length) % ECHO_TINTS.length] ?? PALETTE.cyan;
}
