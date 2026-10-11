import { devices, expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { bootToMenu, frames, hook, player, trackErrors } from './helpers';

/**
 * iPhone (Safari-like) end to end on Chromium: iPhone 15 emulation (touch, isMobile, DPR 3) in landscape at
 * 852×393 (the home-screen web app's full-screen size). Real multi-touch is injected through CDP
 * (Input.dispatchTouchEvent), which Chromium turns into touch Pointer Events exactly like a phone.
 *
 * Flow: boot (touch mode, PWA meta, Add to Home Screen hint) → tap Begin → tap Begin on the intro → joystick drag
 * moves the player (recorded input stays -1/0/1) with Interact tapped by a second finger at the same time → New echo →
 * timeline strip tap opens the sheet, drag scrubs → pause button → hold-to-restart → portrait shows the rotate
 * overlay and pauses. Screenshots of the HUD, the timeline sheet and the menu go to test-results/mobile (or
 * $MOBILE_SHOTS).
 */

test.describe.configure({ timeout: 420_000 });

const { defaultBrowserType: _ignored, ...IPHONE } = devices['iPhone 15'];
test.use({ ...IPHONE, viewport: { width: 852, height: 393 } });

const SHOTS = process.env['MOBILE_SHOTS'] ?? 'test-results/mobile';

type Pt = { x: number; y: number; id: number };

async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox();
  if (!b) throw new Error('element has no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function touchApi(cdp: CDPSession) {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Pt[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 6, radiusY: 6, force: 1 })) });
  return {
    start: (points: Pt[]) => send('touchStart', points),
    move: (points: Pt[]) => send('touchMove', points),
    /** `remaining` = fingers still down after the lift. */
    end: (remaining: Pt[] = []) => send('touchEnd', remaining),
  };
}

type Rec = { moveX: number; moveY: number; interactPressed: boolean }[];
const recording = (page: Page): Promise<Rec> =>
  page.evaluate(() => (window as unknown as { __RECURSION__: { game: { getRecording(): Rec } } }).__RECURSION__.game.getRecording().map((i) => ({ moveX: i.moveX, moveY: i.moveY, interactPressed: i.interactPressed })));

test('iPhone landscape: touch controls play a chamber end to end', async ({ page }) => {
  const errors = trackErrors(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = touchApi(cdp);
  const tap = async (l: Locator, id = 1): Promise<void> => {
    const c = await center(l);
    await touch.start([{ ...c, id }]);
    await frames(page, 1);
    await touch.end();
    await frames(page, 1);
  };

  // ---- boot: touch-first, PWA plumbing, Add to Home Screen hint (iOS Safari, not standalone)
  await bootToMenu(page);
  const root = page.getByTestId('ui-root');
  await expect(root).toHaveAttribute('data-input', 'touch');
  await expect(root).toHaveClass(/rx-touch-on/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '';
    const res = await fetch(href);
    const m = (await res.json()) as { name: string; display: string; orientation: string; icons: { src: string }[] };
    const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, new URL(href, location.href)))).status));
    const apple = await fetch(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? '');
    return { name: m.name, display: m.display, orientation: m.orientation, icons, apple: apple.status };
  });
  expect(manifest).toMatchObject({ name: 'RECURSION', display: 'fullscreen', orientation: 'landscape', apple: 200 });
  expect(manifest.icons.every((s) => s === 200)).toBe(true);
  await expect(page.getByTestId('a2hs-hint')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await frames(page, 2);
  await page.screenshot({ path: `${SHOTS}/menu.png` });

  // ---- tap Begin → intro card → tap Begin
  await tap(page.getByTestId('menu-continue'));
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('intro');
  await tap(page.getByTestId('intro-begin'));
  await expect.poll(() => hook(page, (h) => h.mode), { timeout: 60_000 }).toBe('playing');
  const controls = page.getByTestId('touch-controls');
  await expect(controls).toBeVisible();
  await expect(page.getByTestId('touch-interact')).toBeVisible();
  await expect(page.getByTestId('touch-pause')).toBeVisible();

  // ---- joystick drag (finger 1) moves the player; Interact tapped by finger 2 meanwhile (multi-touch)
  const before = await player(page);
  const stick = { x: 120, y: 300, id: 1 };
  await touch.start([stick]);
  await touch.move([{ ...stick, x: stick.x + 30 }]);
  await touch.move([{ ...stick, x: stick.x + 70 }]);
  await expect(page.locator('.rx-joy.on .knob')).toBeVisible();
  const interactAt = await center(page.getByTestId('touch-interact'));
  await touch.start([{ ...stick, x: stick.x + 70 }, { ...interactAt, id: 2 }]);
  await frames(page, 1);
  await touch.end([{ ...stick, x: stick.x + 70 }]);
  await expect
    .poll(async () => {
      await frames(page, 1);
      const p = await player(page);
      return Math.hypot(p.x - before.x, p.z - before.z);
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  await page.screenshot({ path: `${SHOTS}/hud.png` });
  await touch.end([]);
  await frames(page, 2);
  const rec = await recording(page);
  expect(rec.length).toBeGreaterThan(0);
  expect(rec.every((i) => [-1, 0, 1].includes(i.moveX) && [-1, 0, 1].includes(i.moveY))).toBe(true);
  expect(rec.some((i) => i.moveX !== 0 || i.moveY !== 0)).toBe(true);
  expect(rec.filter((i) => i.interactPressed).length).toBe(1); // latched once, never dropped or doubled
  // Released: the player stops (the last recorded inputs are idle).
  await frames(page, 2);
  const tail = (await recording(page)).slice(-2);
  expect(tail.every((i) => i.moveX === 0 && i.moveY === 0)).toBe(true);

  // ---- New echo
  await tap(page.getByTestId('touch-echo'));
  await expect.poll(() => hook(page, (h) => h.echoes()), { timeout: 60_000 }).toBe(1);

  // ---- timeline: tap the strip → sheet; drag on the tracks scrubs (big touch target)
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(20);
  await tap(page.getByTestId('timeline').locator('.rx-tl-body'));
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(true);
  await expect(page.getByTestId('timeline')).toHaveClass(/expanded/);
  await expect(page.getByTestId('touch-interact')).toBeHidden(); // joystick + buttons step aside, pause stays
  await expect(page.getByTestId('touch-pause')).toBeVisible();
  const stage = page.getByTestId('timeline').locator('.rx-tl-stage');
  const sb = await stage.boundingBox();
  if (!sb) throw new Error('no stage');
  expect(sb.height).toBeGreaterThanOrEqual(60);
  const y = sb.y + sb.height * 0.6;
  await touch.start([{ x: sb.x + sb.width * 0.15, y, id: 3 }]);
  await frames(page, 1);
  await touch.move([{ x: sb.x + sb.width * 0.4, y, id: 3 }]);
  await frames(page, 1);
  await touch.move([{ x: sb.x + sb.width * 0.55, y, id: 3 }]);
  await frames(page, 1);
  await expect(stage).toHaveAttribute('aria-valuetext', /Preview/);
  const scrubbed = Number(await stage.getAttribute('aria-valuenow'));
  const maxTicks = Number(await stage.getAttribute('aria-valuemax'));
  expect(Math.abs(scrubbed - maxTicks * 0.55)).toBeLessThan(maxTicks * 0.12);
  await page.screenshot({ path: `${SHOTS}/timeline-sheet.png` });
  await touch.end();
  await frames(page, 1);
  await tap(page.getByTestId('timeline').getByRole('button', { name: 'Toggle expanded timeline' }));
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(false);
  await expect(page.getByTestId('touch-interact')).toBeVisible();

  // ---- pause button → pause menu; restart needs a hold on touch
  await tap(page.getByTestId('touch-pause'));
  await expect(page.getByTestId('pause')).toBeVisible();
  await expect(controls).toBeHidden();
  // (That a short tap does NOT restart is unit-tested: under software WebGL a single frame can outlast the hold.)
  await expect(page.getByTestId('pause-restart')).toContainText('Hold');
  expect(await hook(page, (h) => h.echoes())).toBe(1);
  const restartAt = await center(page.getByTestId('pause-restart'));
  await touch.start([{ ...restartAt, id: 5 }]);
  await expect.poll(() => hook(page, (h) => h.echoes()), { timeout: 30_000 }).toBe(0);
  await touch.end();
  await expect(page.getByTestId('pause')).toBeHidden();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');

  // ---- portrait: rotate overlay, game paused; back to landscape: overlay gone, pause menu waiting
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.getByTestId('rotate-overlay')).toBeVisible();
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('pause');
  await frames(page, 1);
  await page.screenshot({ path: `${SHOTS}/portrait.png` });
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
  await expect(page.getByTestId('pause')).toBeVisible();

  expect(errors).toEqual([]);
});
