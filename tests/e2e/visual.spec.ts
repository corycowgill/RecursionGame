import { expect, test, type Page } from '@playwright/test';
import { bootToMenu, frames, hook, playLevel, trackErrors } from './helpers';

/**
 * VISUAL REGRESSION — representative states compared against committed baselines
 * (tests/e2e/visual.spec.ts-snapshots/). Re-bless after an intended visual change with
 *   CI=1 E2E_PORT=4311 npm run test:e2e:update-snapshots
 * and review the PNG diff.
 *
 * Determinism strategy for headless SwiftShader:
 *  - 3D: graphics-preview.html in its deterministic mode (?t=<tick>: the real TemporalGame fast-forwarded to a
 *    fixed tick, then N settle frames rendered at a fixed 1/60 s step), so camera, actors and animation clocks are
 *    identical run to run. Tolerances absorb rasterizer / particle noise.
 *  - UI: the real app, with the WebGL canvas and the live timers masked and CSS animations disabled, so the
 *    comparison covers layout, typography, colours and state, not the attract-mode backdrop.
 */

test.describe.configure({ timeout: 240_000 });

const UI_SHOT = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02, threshold: 0.2 } as const;
const GL_SHOT = { animations: 'disabled', maxDiffPixelRatio: 0.05, threshold: 0.3 } as const;

async function previewScene(page: Page, query: string): Promise<void> {
  await page.goto(`/graphics-preview.html?${query}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __PREVIEW__?: { ready: boolean } }).__PREVIEW__?.ready === true), { timeout: 180_000 }).toBe(true);
}

const uiMasks = (page: Page) => [page.locator('#app canvas'), page.getByTestId('hud-time'), page.locator('.rx-rec, .rx-timer, .rx-tl-time')];

test.describe('3D scenes (deterministic preview)', () => {
  const scenes: [string, string][] = [
    ['l03-follow-low', 'scene=level&id=3&t=420&settle=8&quality=low'],
    ['l03-overview-low', 'scene=level&id=3&t=420&settle=8&quality=low&camera=overview'],
    ['showcase-overview-low', 'scene=showcase&t=150&settle=8&quality=low&camera=overview'],
    ['chamber-follow-high', 'scene=chamber&t=200&settle=6&quality=high'],
  ];
  for (const [name, query] of scenes) {
    test(name, async ({ page }) => {
      const errors = trackErrors(page);
      await previewScene(page, query);
      await expect(page).toHaveScreenshot(`${name}.png`, GL_SHOT);
      expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
    });
  }
});

test.describe('UI states (real app, canvas masked)', () => {
  test('main menu, level select, settings', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    await frames(page, 2);
    await expect(page).toHaveScreenshot('ui-main-menu.png', { ...UI_SHOT, mask: uiMasks(page) });
    await page.getByTestId('menu-levels').click();
    await expect(page.getByTestId('level-select')).toBeVisible();
    await frames(page, 2);
    await expect(page).toHaveScreenshot('ui-level-select.png', { ...UI_SHOT, mask: uiMasks(page) });
    await page.getByTestId('back').click();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await frames(page, 2);
    await expect(page).toHaveScreenshot('ui-settings.png', { ...UI_SHOT, mask: uiMasks(page) });
    expect(errors).toEqual([]);
  });

  test('HUD + expanded timeline with an echo, pause menu, level complete', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    await playLevel(page, 0);
    await page.evaluate('window.__RECURSION__.stepIdle(60)');
    await page.keyboard.press('KeyR');
    await expect.poll(() => hook(page, (h) => h.echoes())).toBe(1);
    // Deterministic sim position for the HUD/timeline: freeze via the timeline, then step to a fixed tick.
    await page.keyboard.press('Tab');
    await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(true);
    await page.evaluate('window.__RECURSION__.stepIdle(90 - window.__RECURSION__.getState().tick)');
    await frames(page, 3);
    await expect(page).toHaveScreenshot('ui-timeline-expanded.png', { ...UI_SHOT, mask: uiMasks(page) });
    await page.keyboard.press('Tab');
    await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(false);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause')).toBeVisible();
    await frames(page, 2);
    await expect(page).toHaveScreenshot('ui-pause.png', { ...UI_SHOT, mask: uiMasks(page) });
    await page.getByTestId('pause-resume').click();

    const r = await hook(page, (h) => h.runSolution());
    expect(r.completed).toBe(true);
    await expect(page.getByTestId('level-complete')).toBeVisible({ timeout: 60_000 });
    await frames(page, 3);
    await expect(page).toHaveScreenshot('ui-level-complete.png', { ...UI_SHOT, mask: uiMasks(page) });
    expect(errors).toEqual([]);
  });
});
