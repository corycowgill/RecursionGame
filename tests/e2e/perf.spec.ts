import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { bootToMenu, hook, trackErrors } from './helpers';

/**
 * IN-BROWSER FPS MEASUREMENT — `CI=1 E2E_PORT=4311 npm run test:e2e:perf`.
 * Loads the heaviest campaign chamber (most echoes at once, all of them moving), plays its verified solution in
 * real time (autopilot: echoes + player all act, as in real play), and samples requestAnimationFrame for a fixed
 * window at each quality preset. Reports average FPS, frame-time percentiles, the share of frames under the
 * 60/30 FPS budgets, draw calls and triangles. Results: test-results/perf/fps.json (+ console).
 *
 * IMPORTANT: in this container Chromium renders WebGL with SwiftShader (CPU rasterizer), so absolute numbers are
 * NOT representative of a real GPU; they are still useful for relative comparisons (high vs low, before/after).
 */

const SAMPLE_MS = Number(process.env['PERF_SAMPLE_MS'] ?? 12_000);
const QUALITIES = (process.env['PERF_QUALITIES'] ?? 'high,low').split(',');

interface FrameStats {
  frames: number;
  seconds: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  under60: number;
  under30: number;
}

async function sampleFrames(page: Page, ms: number): Promise<FrameStats> {
  return page.evaluate(
    (windowMs) =>
      new Promise<FrameStats>((resolve) => {
        const deltas: number[] = [];
        let last = -1;
        let t0 = -1;
        const f = (now: number): void => {
          if (t0 < 0) t0 = now;
          if (last >= 0) deltas.push(now - last);
          last = now;
          if (now - t0 < windowMs) requestAnimationFrame(f);
          else {
            const sorted = [...deltas].sort((a, b) => a - b);
            const pct = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
            const seconds = (now - t0) / 1000;
            const r2 = (x: number): number => Math.round(x * 100) / 100;
            resolve({
              frames: deltas.length,
              seconds: r2(seconds),
              fps: r2(deltas.length / seconds),
              p50: r2(pct(0.5)),
              p95: r2(pct(0.95)),
              p99: r2(pct(0.99)),
              worst: r2(sorted[sorted.length - 1] ?? 0),
              under60: r2(deltas.filter((d) => d <= 1000 / 60 + 1).length / Math.max(1, deltas.length)),
              under30: r2(deltas.filter((d) => d <= 1000 / 30 + 1).length / Math.max(1, deltas.length)),
            });
          }
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
}

test.describe.configure({ timeout: 600_000 });

test('FPS on the heaviest chamber at each quality preset', async ({ page, browserName }) => {
  const errors = trackErrors(page);
  const results: Record<string, unknown>[] = [];
  const gl = { renderer: '', vendor: '' };
  for (const quality of QUALITIES) {
    await bootToMenu(page, `?quality=${quality}`);
    // Default: the last campaign chamber (currently L03 The Relay, the vertical slice: most entities, two echoes
    // and the player all moving, a carried crate, timed door). Override with PERF_LEVEL=<index>.
    const count = await hook(page, (h) => h.levels.length);
    const heavy = process.env['PERF_LEVEL'] !== undefined ? Number(process.env['PERF_LEVEL']) : count - 1;
    const levelId = await page.evaluate(`window.__RECURSION__.loadLevel(${heavy})`);
    await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
    // Real-time autopilot of the verified solution: all echoes and the player move every tick.
    const r = await hook(page, (h) => h.runSolution({ instant: false }));
    expect(r.echoes).toBeGreaterThan(0);
    await page.waitForTimeout(1500); // let shaders compile / caches warm
    const tick0 = await hook(page, (h) => h.getState().tick);
    const stats = await sampleFrames(page, SAMPLE_MS);
    const tick1 = await hook(page, (h) => h.getState().tick);
    const render = await hook(page, (h) => h.renderStats());
    Object.assign(
      gl,
      await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2');
        const ext = c?.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: ext && c ? String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
          vendor: ext && c ? String(c.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : 'unknown',
        };
      }),
    );
    const viewport = page.viewportSize();
    const row = { quality, levelId, echoes: r.echoes, viewport, ...stats, simTicksAdvanced: tick1 - tick0, render };
    results.push(row);
    process.stdout.write(`\n[perf] ${JSON.stringify(row)}\n`);
    expect(stats.frames).toBeGreaterThan(3); // the page kept rendering
  }
  const out = { date: new Date().toISOString(), browser: browserName, gl, sampleMs: SAMPLE_MS, results };
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync('test-results/perf/fps.json', JSON.stringify(out, null, 2));
  await test.info().attach('fps.json', { body: JSON.stringify(out, null, 2), contentType: 'application/json' });
  expect(errors.filter((e) => !/ReadPixels|GPU stall/i.test(e))).toEqual([]);
});
