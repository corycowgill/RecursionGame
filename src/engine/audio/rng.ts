/**
 * Cosmetic seeded RNG (mulberry32) for sound variation. Audio never feeds back into the simulation, so this is
 * deliberately separate from the simulation RNG stored in SimState.
 */
export class AudioRng {
  private s: number;
  constructor(seed = 0x5ec0251) {
    this.s = seed >>> 0 || 1;
  }
  /** Uniform [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** ±amount around 1 (e.g. jitter(0.05) → 0.95..1.05). */
  jitter(amount: number): number {
    return 1 + (this.next() * 2 - 1) * amount;
  }
  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    const v = items[Math.floor(this.next() * items.length)];
    return v as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
