import { describe, expect, it } from 'vitest';
import { ResolutionController } from './resolution';

/** Feeds `windows` full windows of a constant frame time; returns the scale after each window. */
function run(c: ResolutionController, frameMs: number, windows: number, windowFrames = 30): number[] {
  const out: number[] = [];
  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < windowFrames; i++) c.update(frameMs);
    out.push(c.scale);
  }
  return out;
}

describe('ResolutionController', () => {
  it('starts at full scale and holds it while the target is met', () => {
    const c = new ResolutionController({ targetFps: 60 });
    expect(c.scale).toBe(1);
    run(c, 16.7, 20);
    expect(c.scale).toBe(1);
    expect(c.changes).toBe(0);
  });

  it('steps down one notch per slow window, never below the floor', () => {
    const c = new ResolutionController({ targetFps: 60, minScale: 0.6, step: 0.1 });
    expect(run(c, 33, 3)).toEqual([0.9, 0.8, 0.7]);
    run(c, 33, 10);
    expect(c.scale).toBe(0.6);
  });

  it('holds a 30 fps mobile target: 30 fps frames are fine, 20 fps frames step down', () => {
    const c = new ResolutionController({ targetFps: 30, minScale: 0.5 });
    run(c, 33.4, 10);
    expect(c.scale).toBe(1);
    run(c, 50, 2);
    expect(c.scale).toBe(0.8);
  });

  it('ignores the hysteresis band (neither clearly slow nor meeting the target)', () => {
    const c = new ResolutionController({ targetFps: 60 });
    run(c, 33, 2); // 0.8
    run(c, 18.5, 30); // 1.11 x budget: inside the band
    expect(c.scale).toBe(0.8);
  });

  it('steps back up only after several good windows', () => {
    const c = new ResolutionController({ targetFps: 60, upWindows: 4 });
    run(c, 33, 2); // 0.8
    const scales = run(c, 16.7, 8);
    expect(scales.slice(0, 3)).toEqual([0.8, 0.8, 0.8]);
    expect(scales[3]).toBe(0.9);
    expect(scales[7]).toBe(1);
  });

  it('uses the window median, so isolated hitches do not trigger a step', () => {
    const c = new ResolutionController({ targetFps: 60 });
    for (let w = 0; w < 10; w++) for (let i = 0; i < 30; i++) c.update(i % 10 === 0 ? 80 : 16.7);
    expect(c.scale).toBe(1);
  });

  it('discards stalls (tab switch, breakpoint) instead of counting them as slow frames', () => {
    const c = new ResolutionController({ targetFps: 60 });
    for (let i = 0; i < 200; i++) c.update(i % 2 ? 2000 : 16.7);
    expect(c.scale).toBe(1);
    for (let i = 0; i < 100; i++) c.update(5000);
    expect(c.scale).toBe(1);
  });

  it('backs off after an up-step that immediately fails (no oscillation)', () => {
    // a GPU that manages the target at 0.8 but not at 0.9
    const c = new ResolutionController({ targetFps: 60, upWindows: 2, failWindows: 2 });
    const frame = (): number => (c.scale > 0.85 ? 22 : 16.7);
    let ups = 0;
    let last = c.scale;
    for (let w = 0; w < 200; w++) {
      for (let i = 0; i < 30; i++) c.update(frame());
      if (c.scale > last) ups++;
      last = c.scale;
    }
    // without backoff it would retry every 2 good windows (~66 times in 200 windows)
    expect(ups).toBeLessThan(12);
    expect(c.scale).toBeLessThanOrEqual(0.9);
  });

  it('reset() and resetWindow() clear history', () => {
    const c = new ResolutionController({ targetFps: 60 });
    run(c, 33, 3);
    expect(c.scale).toBeCloseTo(0.7);
    for (let i = 0; i < 29; i++) c.update(40);
    c.resetWindow();
    c.update(40);
    expect(c.scale).toBeCloseTo(0.7); // the partial window was dropped
    c.reset();
    expect(c.scale).toBe(1);
  });

  it('still adapts on a very slow device (a few fps is slow, not a stall)', () => {
    const c = new ResolutionController({ targetFps: 30, minScale: 0.5 });
    run(c, 400, 3);
    expect(c.scale).toBeCloseTo(0.7);
  });

  it('ignores invalid samples', () => {
    const c = new ResolutionController({ targetFps: 60 });
    for (let i = 0; i < 100; i++) expect(c.update(i % 2 ? Number.NaN : -5)).toBe(false);
    expect(c.scale).toBe(1);
  });
});
