// Captures renderer screenshots from graphics-preview.html (deterministic ?t= mode).
// Usage: start `npx vite --port 5199` then `node src/graphics/tools/capture-screenshots.mjs [tag]`.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5199/graphics-preview.html';
const OUT = 'docs/art-direction/screenshots';
const tag = process.argv[2] ?? 'iter';
const only = process.argv[3];
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'chamber-follow', q: 'scene=chamber&t=200&settle=' + (process.env.SETTLE ?? 45) },
  { name: 'chamber-overview', q: 'scene=chamber&t=330&camera=overview&settle=' + (process.env.SETTLE ?? 45) },
  { name: 'showcase-overview', q: 'scene=showcase&t=150&camera=overview&settle=' + (process.env.SETTLE ?? 45) },
  { name: 'chamber-intro', q: 'scene=chamber&t=150&intro=1&settle=80' },
  { name: 'level03-overview', q: 'scene=level&id=3&t=420&camera=overview&settle=' + (process.env.SETTLE ?? 45) },
  { name: 'level03-follow', q: 'scene=level&id=3&t=420&settle=' + (process.env.SETTLE ?? 45) },
  { name: 'showcase-follow', q: 'scene=showcase&t=100&settle=' + (process.env.SETTLE ?? 45) },
].filter((s) => !only || s.name.includes(only));

const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
for (const s of shots) {
  const t0 = Date.now();
  await page.goto(`${BASE}?${s.q}&quality=${process.env.Q ?? 'high'}`);
  await page.waitForFunction(() => window.__PREVIEW__?.ready === true, null, { timeout: 240_000 });
  const stats = await page.evaluate(() => window.__PREVIEW__.stats());
  const file = `${OUT}/${tag}-${s.name}.png`;
  await page.screenshot({ path: file });
  console.log(file, JSON.stringify(stats), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
