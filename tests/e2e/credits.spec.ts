import { devices, expect, test, type Page } from '@playwright/test';
import { bootToMenu, frames, hook, trackErrors } from './helpers';

/**
 * Credits and ending (round 5, narrative & release).
 *   1. Main menu → Credits with the keyboard: studio header, team, licenses; arrows walk the sections; Esc returns.
 *   2. The same with a (mocked) standard-mapping controller: A opens, D-pad walks the sections, B returns.
 *   3. Touch (iPhone emulation): tap Credits, the roll scrolls by touch (pan-y), tap Back.
 *   4. A finished campaign (seeded save): level select offers Ending; it plays, any key skips it, the credits roll
 *      with a "Main menu" button, and Esc goes back to the main menu.
 */

test.describe.configure({ timeout: 360_000 });

const focusedTestId = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const focusedTag = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.tagName ?? null);

async function expectCreditsContent(page: Page): Promise<void> {
  const credits = page.getByTestId('credits');
  await expect(credits).toBeVisible();
  await expect(credits.getByTestId('credits-header')).toContainText('HALLUCINATED');
  await expect(credits.getByTestId('credits-header')).toContainText('presents');
  await expect(credits.getByTestId('credits-header')).toContainText('RECURSION');
  await expect(credits.getByTestId('credits-team')).toContainText('directed by Cory Cowgill');
  await expect(credits.getByTestId('credits-licenses')).toContainText('three.js');
  await expect(credits.getByTestId('credits-licenses')).toContainText('SIL Open Font License');
}

test('credits: keyboard navigation from the main menu', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  await page.getByTestId('menu-credits').focus();
  await page.keyboard.press('Enter');
  await expectCreditsContent(page);
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('credits');
  // The roll's font family is the studio intro's (Orbitron for the studio mark).
  const font = await page.locator('.rx-credits .studio').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).toContain('Orbitron');
  // ↑/↓ walk the sections; End jumps to the leave button
  await page.getByTestId('credits-header').focus();
  await page.keyboard.press('ArrowDown');
  expect(await focusedTestId(page)).toBe('credits-team');
  await page.keyboard.press('ArrowDown');
  expect(await focusedTestId(page)).toBe('credits-more');
  await page.keyboard.press('ArrowUp');
  expect(await focusedTestId(page)).toBe('credits-team');
  await page.keyboard.press('End');
  expect(await focusedTestId(page)).toBe('credits-back');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('credits')).toHaveCount(0);
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('menu');
  expect(errors).toEqual([]);
});

test('credits: gamepad navigation (A opens, D-pad walks the sections, B returns)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    (window as unknown as Record<string, unknown>)['__padSet'] = (i: number, on: boolean) => {
      pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
      pad.timestamp++;
    };
  });
  const press = async (i: number): Promise<void> => {
    await page.evaluate((b) => (window as unknown as { __padSet(i: number, on: boolean): void }).__padSet(b, true), i);
    await frames(page, 1);
    await page.evaluate((b) => (window as unknown as { __padSet(i: number, on: boolean): void }).__padSet(b, false), i);
    await frames(page, 1);
  };
  await bootToMenu(page);
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
  await frames(page, 2);
  await page.getByTestId('menu-credits').focus();
  await press(0); // A
  await expectCreditsContent(page);
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('credits');
  await page.getByTestId('credits-header').focus();
  await press(13); // D-pad down: next section
  await expect.poll(() => focusedTestId(page)).toBe('credits-team');
  expect(await focusedTag(page)).toBe('SECTION');
  await press(1); // B
  await expect(page.getByTestId('credits')).toHaveCount(0);
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('menu');
  expect(errors).toEqual([]);
});

test('credits: touch (iPhone emulation) scrolls the roll and taps back', async ({ browser }) => {
  const { defaultBrowserType: _ignored, ...IPHONE } = devices['iPhone 15'];
  const context = await browser.newContext({ ...IPHONE, viewport: { width: 852, height: 393 } });
  const page = await context.newPage();
  const errors = trackErrors(page);
  await bootToMenu(page);
  await page.getByTestId('menu-credits').tap();
  await expectCreditsContent(page);
  const roll = page.getByTestId('credits-roll');
  const geo = await roll.evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight, touchAction: getComputedStyle(el).touchAction, overflow: getComputedStyle(el).overflowY }));
  expect(geo.scrollable).toBe(true);
  expect(geo.touchAction).toBe('pan-y');
  expect(geo.overflow).toBe('auto');
  // a finger drag scrolls the roll (CDP touch events, like a phone)
  const box = (await roll.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 25, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => roll.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
  await page.getByTestId('credits-back').tap();
  await expect(page.getByTestId('credits')).toHaveCount(0);
  await expect(page.getByTestId('main-menu')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('ending: replay from level select after finishing the campaign, skip with any key, credits, back to the menu', async ({ page }) => {
  const errors = trackErrors(page);
  // A save in which every chamber is completed (the save migrates partial data onto the defaults).
  await page.addInitScript(() => {
    const ids = ['L01-first-echo', 'L02-two-places', 'L03-the-relay', 'L04-the-lift', 'L05-perfect-timing', 'L06-chain-reaction', 'L07-broken-sequence', 'L08-recursive-machine', 'L09-paradox-chamber', 'L10-the-core'];
    if (localStorage.getItem('recursion.save')) return;
    const records: Record<string, unknown> = {};
    for (const id of ids) records[id] = { completions: 1, bestTicks: 1200, bestEchoes: 3, bestStars: 2 };
    localStorage.setItem('recursion.save', JSON.stringify({ version: 1, progress: { version: 1, records } }));
  });
  await bootToMenu(page);
  expect(await hook(page, (h) => h.levels[h.levels.length - 1])).toBe('L10-the-core');
  await page.getByTestId('menu-levels').click();
  await expect(page.getByTestId('level-select')).toBeVisible();
  await page.getByTestId('levels-ending').click();
  await expect.poll(() => hook(page, (h) => h.mode), { timeout: 120_000 }).toBe('ending');
  await expect(page.getByTestId('ending')).toBeVisible();
  expect(await hook(page, (h) => h.levelId)).toBe('L10-the-core');
  expect(await hook(page, (h) => h.getState().status)).toBe('complete'); // a genuinely finished Core
  await frames(page, 4); // past the skip grace period (input left over from the winning run is ignored)
  await page.keyboard.press('KeyX');
  await expect.poll(() => hook(page, (h) => h.mode), { timeout: 60_000 }).toBe('credits');
  await expectCreditsContent(page);
  await expect(page.getByTestId('credits-back')).toContainText('Main menu');
  await page.keyboard.press('Escape');
  await expect.poll(() => hook(page, (h) => h.mode), { timeout: 60_000 }).toBe('menu');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  expect(errors).toEqual([]);
});
