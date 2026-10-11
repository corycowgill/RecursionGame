import { expect, test, type Page } from '@playwright/test';
import { bootToMenu, frames, hook, player, trackErrors } from './helpers';

/**
 * Gamepad end to end, with a mocked standard-mapping controller (navigator.getGamepads is overridden before the
 * app loads and `gamepadconnected` is dispatched). The Gamepad API has no button events — the game polls once per
 * animation frame — so every press is held across a couple of frames, then released.
 *
 * Flow: hot-plug toast → D-pad menu navigation with the focus ring → A starts chamber 1 and dismisses the intro →
 * left stick moves (recorded input stays -1/0/1) → A interacts (latched press recorded) → Y creates an echo →
 * View opens the timeline, D-pad scrubs, View closes it → Menu pauses, B resumes → hold X restarts → unplugging
 * during play auto-pauses.
 *
 * Round 4: in the pause menu, revealed hints show controller glyphs (Y for New echo, never "Press R"), the HUD hint
 * card follows the device (key cap after a key press, glyph again after a button), and in Settings → Controls a pad A
 * press while a KEYBOARD rebind waits cancels it instead of starting another one.
 */

test.describe.configure({ timeout: 360_000 });

const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, RIGHT: 15 } as const;

async function installMockPad(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    const pad = {
      id,
      index: 0,
      connected: false,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    const w = window as unknown as Record<string, unknown>;
    w['__mockPad'] = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (pad.connected ? [pad, null, null, null] : [null, null, null, null]) });
    w['__padConnect'] = (on: boolean) => {
      pad.connected = on;
      pad.timestamp++;
      window.dispatchEvent(new Event(on ? 'gamepadconnected' : 'gamepaddisconnected'));
    };
    w['__padSet'] = (i: number, on: boolean) => {
      pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
      pad.timestamp++;
    };
    w['__padAxis'] = (i: number, v: number) => {
      pad.axes[i] = v;
      pad.timestamp++;
    };
  }, XBOX_ID);
}

const setButton = (page: Page, i: number, on: boolean): Promise<void> => page.evaluate(([b, v]) => (window as unknown as { __padSet(i: number, on: boolean): void }).__padSet(b as number, v as boolean), [i, on] as const);
const setAxis = (page: Page, i: number, v: number): Promise<void> => page.evaluate(([a, x]) => (window as unknown as { __padAxis(i: number, v: number): void }).__padAxis(a, x), [i, v] as const);
const connect = (page: Page, on: boolean): Promise<void> => page.evaluate((v) => (window as unknown as { __padConnect(on: boolean): void }).__padConnect(v), on);

/**
 * Press and release a button, each state held for one animation frame: the game polls once per frame, before
 * our rAF callback runs. (Holding longer at SwiftShader's ~1 fps would trigger the menus' auto-repeat.)
 */
async function press(page: Page, i: number): Promise<void> {
  await setButton(page, i, true);
  await frames(page, 1);
  await setButton(page, i, false);
  await frames(page, 1);
}

const focusedTestId = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
/** Programmatic click (no pointer event, so the last-used device stays the controller). */
const clickNoPointer = (page: Page, selector: string): Promise<void> => page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), selector);
const focusEl = (page: Page, selector: string): Promise<void> => page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).focus(), selector);

test('gamepad: navigate the menu, start chamber 1, move, interact, create an echo, use the timeline, pause', async ({ page }) => {
  const errors = trackErrors(page);
  await installMockPad(page);
  await bootToMenu(page);

  // Hot-plug: toast + prompts switch to controller glyphs (focus ring shown via .rx-pad).
  await connect(page, true);
  await expect(page.getByTestId('toasts')).toContainText('controller connected');
  await expect(page.getByTestId('ui-root')).toHaveAttribute('data-input', 'xbox');
  await expect(page.getByTestId('ui-root')).toHaveClass(/rx-pad/);

  // D-pad menu navigation: focus starts on Begin/Continue, moves down to Level select and back up.
  await expect.poll(() => focusedTestId(page)).toBe('menu-continue');
  await press(page, B.DOWN);
  await expect.poll(() => focusedTestId(page)).toBe('menu-levels');
  await press(page, B.UP);
  await expect.poll(() => focusedTestId(page)).toBe('menu-continue');

  // A starts chamber 1; A again dismisses the intro card.
  await press(page, B.A);
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 60_000 });
  await press(page, B.A);
  await expect.poll(() => hook(page, (h) => h.mode), { timeout: 60_000 }).toBe('playing');
  await expect(page.locator('.rx-controls')).toContainText('Hold · Restart');

  // Left stick moves the player (quantized input: the recording only ever holds -1/0/1).
  const start = await player(page);
  await setAxis(page, 0, 0.95);
  await expect.poll(async () => (await player(page)).x - start.x, { timeout: 120_000 }).toBeGreaterThan(400);
  await setAxis(page, 0, 0);
  await frames(page, 2);
  const moves = await page.evaluate(() => {
    const g = (window as unknown as { __RECURSION__: { game: { getRecording(): { moveX: number; moveY: number }[] } } }).__RECURSION__.game;
    const rec = g.getRecording();
    return { n: rec.length, values: [...new Set(rec.flatMap((i) => [i.moveX, i.moveY]))].sort() };
  });
  expect(moves.n).toBeGreaterThan(0);
  for (const v of moves.values) expect([-1, 0, 1]).toContain(v);
  expect(moves.values).toContain(1);

  // A interacts: a latched press lands in the recording.
  await press(page, B.A);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __RECURSION__: { game: { getRecording(): { interactPressed: boolean }[] } } }).__RECURSION__.game.getRecording().some((i) => i.interactPressed)), { timeout: 60_000 })
    .toBe(true);

  // Y ends the take: a new echo.
  await press(page, B.Y);
  await expect.poll(() => hook(page, (h) => h.echoes()), { timeout: 60_000 }).toBe(1);
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(2);

  // View opens the timeline; D-pad right scrubs into a preview; View closes it again.
  await press(page, B.VIEW);
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(true);
  await expect(page.getByTestId('timeline-pad-legend')).toBeVisible();
  await press(page, B.RIGHT);
  await expect(page.locator('.rx-tl-stage')).toHaveAttribute('aria-valuetext', /^Preview/);
  await press(page, B.VIEW);
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(false);

  // Menu pauses, B resumes.
  await press(page, B.MENU);
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('pause');
  await expect(page.getByTestId('pause')).toBeVisible();

  // Device-aware hints: reveal two (the second used to read "Press R to rewind") — the controller's Y glyph shows.
  await clickNoPointer(page, '[data-testid="pause-reveal-hint"]');
  await clickNoPointer(page, '[data-testid="pause-reveal-hint"]');
  const list = page.locator('.rx-hintlist');
  await expect(list.locator('.rx-padkey')).toHaveText('Y');
  await expect(list).not.toContainText('Press R');

  // Keyboard rebind oddity: while a keyboard rebind waits, pad A on another row cancels it (no second rebind).
  await clickNoPointer(page, '[data-testid="pause"] .list .rx-btn:nth-child(3)'); // Settings
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('settings');
  await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.rx-tab')).find((b) => b.textContent === 'Controls')!.click());
  await focusEl(page, '.rx-bind[data-action="interact"][data-slot="0"]');
  await press(page, B.A);
  await expect(page.locator('.rx-bind.capturing')).toHaveCount(1);
  await focusEl(page, '.rx-bind[data-action="rewind"][data-slot="0"]');
  await press(page, B.A);
  await expect(page.locator('.rx-bind.capturing')).toHaveCount(0);
  await expect(page.getByTestId('settings')).toContainText('Rebinding cancelled');
  await expect(page.locator('.rx-bind[data-action="interact"][data-slot="0"]')).toHaveText('E');
  await press(page, B.B); // back to the pause menu
  await expect.poll(() => hook(page, (h) => h.screen)).toBe('pause');

  await press(page, B.B);
  await expect.poll(() => hook(page, (h) => h.screen)).toBeNull();

  // The HUD hint card follows the device: Y glyph now, the R key cap after a key press, the glyph again after a button.
  const hintCard = page.getByTestId('hint');
  await expect(hintCard).toBeVisible();
  await expect(hintCard.locator('p .rx-padkey')).toHaveText('Y');
  await page.keyboard.press('Shift');
  await expect(page.getByTestId('ui-root')).toHaveAttribute('data-input', 'keyboard');
  await expect(hintCard.locator('p .rx-key')).toHaveText('R');
  await press(page, B.LB);
  await expect(page.getByTestId('ui-root')).toHaveAttribute('data-input', 'xbox');
  await expect(hintCard.locator('p .rx-padkey')).toHaveText('Y');

  // Hold X (~0.6 s) restarts the chamber: the echo is gone.
  await setButton(page, B.X, true);
  await expect.poll(() => hook(page, (h) => h.echoes()), { timeout: 60_000 }).toBe(0);
  await setButton(page, B.X, false);
  await frames(page, 2);

  // Unplugging during play pauses the game.
  await connect(page, false);
  await expect.poll(() => hook(page, (h) => h.screen), { timeout: 30_000 }).toBe('pause');
  await expect(page.getByTestId('toasts')).toContainText('Controller disconnected');

  expect(errors).toEqual([]);
});
