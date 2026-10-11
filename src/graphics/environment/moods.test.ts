import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { PALETTE } from '../materials/palette';
import { CHAMBER_MOODS, DEFAULT_MOOD, moodFor } from './moods';

const hsl = (hex: number) => new Color(hex).getHSL({ h: 0, s: 0, l: 0 });
/** Hue distance on the colour wheel, 0..0.5. */
const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

describe('chamber moods (round 5)', () => {
  it('gives every campaign chamber its own mood', () => {
    const names = new Set<string>();
    for (const level of CAMPAIGN_LEVELS) {
      const m = moodFor(level);
      expect(m, level.id).not.toBe(DEFAULT_MOOD);
      names.add(m.name);
    }
    expect(names.size).toBe(CAMPAIGN_LEVELS.length);
  });

  it('falls back to the pre-round-5 look for non-campaign levels', () => {
    expect(moodFor({ id: 'T00-test-chamber' })).toBe(DEFAULT_MOOD);
    expect(moodFor({ id: 'G00-graphics-showcase' })).toBe(DEFAULT_MOOD);
    expect(moodFor(null)).toBe(DEFAULT_MOOD);
    // the default reproduces the old hard-coded renderer values
    expect(DEFAULT_MOOD.key).toEqual({ color: 0xffcf9a, intensity: 3.6 });
    expect(DEFAULT_MOOD.fog).toEqual({ color: 0x24506e, density: 0.0085 });
    expect(DEFAULT_MOOD.exposure).toBe(0.9);
    expect(DEFAULT_MOOD.material.patina + DEFAULT_MOOD.material.grime + DEFAULT_MOOD.material.chrome).toBe(0);
  });

  it('keeps backdrop accents out of the coral / hazard hue range', () => {
    const coral = hsl(PALETTE.coral).h;
    // no accent may sit closer to coral than the authored gold / lamp colours already do
    const limit = Math.min(hueDist(hsl(PALETTE.gold).h, coral), hueDist(hsl(PALETTE.warmLamp).h, coral)) - 0.003;
    for (const [id, m] of Object.entries(CHAMBER_MOODS)) {
      for (const c of [m.accent, m.accent2, m.accent3, m.practical.tint]) {
        const { h, s } = hsl(c);
        // saturated colours must stay away from coral; desaturated (white-ish) ones are neutral
        if (s > 0.35) expect(hueDist(h, coral), `${id} ${c.toString(16)}`).toBeGreaterThan(limit);
      }
    }
  });

  it('keeps the key light warm-to-neutral and bright enough for the gold player and ivory suit', () => {
    for (const [id, m] of Object.entries(CHAMBER_MOODS)) {
      const c = new Color(m.key.color);
      // never blue- or violet-dominant: the player must stay gold under every mood
      expect(c.r, id).toBeGreaterThanOrEqual(c.b);
      expect(m.key.intensity, id).toBeGreaterThan(3);
      expect(m.key.intensity, id).toBeLessThan(4.5);
      expect(m.exposure, id).toBeGreaterThan(0.8);
      expect(m.exposure, id).toBeLessThan(1.05);
    }
  });

  it('keeps fog and wear in a sane range', () => {
    for (const [id, m] of Object.entries(CHAMBER_MOODS)) {
      expect(m.fog.density, id).toBeGreaterThan(0.005);
      expect(m.fog.density, id).toBeLessThan(0.012);
      for (const v of [m.material.patina, m.material.grime, m.material.chrome]) {
        expect(v, id).toBeGreaterThanOrEqual(0);
        expect(v, id).toBeLessThanOrEqual(0.6);
      }
      // patina is a dull verdigris, never a saturated teal (teal = powered machinery)
      expect(hsl(m.material.patinaColor).s, id).toBeLessThan(0.35);
    }
  });
});
