import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FixedStepper } from './stepper';
import { hashValue } from './hash';
import { rngNext, seedRng } from './rng';
import { deepClone } from './clone';

describe('rng & hash', () => {
  it('seeded rng is reproducible and well spread', () => {
    let a = seedRng(42);
    let b = seedRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const ra = rngNext(a);
      const rb = rngNext(b);
      expect(ra.value).toBe(rb.value);
      a = ra.state;
      b = rb.state;
      seen.add(ra.value % 1000);
    }
    expect(seen.size).toBeGreaterThan(550);
    expect(seedRng(1)).not.toBe(seedRng(2));
  });

  it('hash is key-order independent but value sensitive', () => {
    expect(hashValue({ a: 1, b: [true, 'x', null] })).toBe(hashValue({ b: [true, 'x', null], a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
    expect(hashValue([1])).not.toBe(hashValue(['1']));
    expect(hashValue({ a: undefined, b: 1 })).toBe(hashValue({ b: 1 }));
  });

  it('deepClone produces independent copies', () => {
    const src = { a: [1, { b: 2 }], c: null };
    const c = deepClone(src);
    (c.a[1] as { b: number }).b = 3;
    expect((src.a[1] as { b: number }).b).toBe(2);
  });
});

describe('FixedStepper', () => {
  it('runs 60 ticks per simulated second regardless of frame rate', () => {
    for (const fps of [30, 60, 144, 240]) {
      let ticks = 0;
      const s = new FixedStepper(() => ticks++);
      for (let f = 0; f < fps * 2; f++) s.advance(1000 / fps);
      expect(Math.abs(ticks - 120)).toBeLessThanOrEqual(1);
    }
  });

  it('caps steps per frame after a stall and exposes alpha', () => {
    let ticks = 0;
    const s = new FixedStepper(() => ticks++, 5);
    expect(s.advance(1000)).toBe(5);
    s.reset();
    s.advance(1000 / 120);
    expect(s.alpha).toBeGreaterThan(0.4);
    expect(s.alpha).toBeLessThan(0.6);
    s.paused = true;
    expect(s.advance(100)).toBe(0);
  });
});

describe('determinism rules (static lint)', () => {
  const SIM_DIRS = ['src/engine/simulation', 'src/engine/temporal', 'src/engine/physics', 'src/engine/contracts', 'src/gameplay'];
  const FORBIDDEN: [RegExp, string][] = [
    [/Math\.random\s*\(/, 'Math.random'],
    [/Date\.now\s*\(|new Date\s*\(/, 'Date'],
    [/performance\.now\s*\(/, 'performance.now'],
    [/localeCompare\s*\(/, 'localeCompare'],
    [/requestAnimationFrame|setTimeout|setInterval/, 'timers'],
    [/from ['"]three['"]/, 'three import'],
  ];
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  };
  SIM_DIRS.forEach(walk);

  it('simulation code contains no nondeterministic APIs', () => {
    expect(files.length).toBeGreaterThan(10);
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const [re, name] of FORBIDDEN) if (re.test(src)) violations.push(`${f}: ${name}`);
    }
    expect(violations).toEqual([]);
  });
});
