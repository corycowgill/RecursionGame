/**
 * Seeded deterministic RNG (mulberry32). State is a uint32 stored in SimState.rng so it is snapshotted,
 * rewound and hashed with the rest of the world. Never use Math.random in simulation code.
 */
export function rngNext(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: (t ^ (t >>> 14)) >>> 0, state: next };
}

/** Integer in [0, maxExclusive) without floating point. */
export function rngInt(value: number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return value % maxExclusive;
}

export function seedRng(seed: number): number {
  // Avalanche the seed so small seeds still give well-distributed sequences.
  let s = (seed ^ 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return (s ^ (s >>> 16)) >>> 0;
}
