// Renders public/icons/icon.svg (the RECURSION ring motif) to the PNG app icons with the preinstalled Chromium:
//   node src/ui/preview/gen-icons.mjs
// Outputs: apple-touch-icon.png (180), icon-192.png, icon-512.png and icon-maskable-512.png (motif scaled into the
// 80% safe zone). Re-run after editing the SVG.
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const OUT = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
];
const browser = await chromium.launch({ executablePath: existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, scale] of OUT) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<html><body style="margin:0;background:#03070e;width:${size}px;height:${size}px;display:grid;place-items:center;overflow:hidden">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: `public/icons/${name}`, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`public/icons/${name}`);
}
await browser.close();
