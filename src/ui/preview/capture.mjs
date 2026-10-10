// Captures UI preview screenshots into docs/art-direction/screenshots/ui-*.png.
// Usage: start a dev server (npx vite --port 5191 --strictPort) then:
//   node src/ui/preview/capture.mjs [baseUrl] [screen ...]
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5191';
const only = process.argv.slice(3);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = 'docs/art-direction/screenshots';
mkdirSync(out, { recursive: true });

const SHOTS = [
  ['menu', 'screen=menu'],
  ['levels', 'screen=levels'],
  ['settings', 'screen=settings&tab=access'],
  ['controls', 'screen=settings&tab=controls'],
  ['hud', 'screen=hud'],
  ['timeline', 'screen=timeline'],
  ['timeline-hc', 'screen=timeline&palette=highContrast'],
  ['pause', 'screen=pause'],
  ['intro', 'screen=intro'],
  ['complete', 'screen=complete'],
  ['onboarding', 'screen=onboarding'],
  ['credits', 'screen=credits'],
];

const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const [name, query] of SHOTS) {
  if (only.length && !only.includes(name)) continue;
  await page.goto(`${base}/ui-preview.html?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__UIPREVIEW__?.ready === true, null, { timeout: 150_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600); // let entrance animations settle
  await page.screenshot({ path: `${out}/ui-${name}.png` });
  console.log(`ui-${name}.png`);
}
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
