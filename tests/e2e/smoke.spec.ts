import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end smoke tests for the integrated vertical slice (real renderer, UI, audio and temporal engine).
 * Headless Chromium runs WebGL on SwiftShader at a few frames per second, so assertions poll the simulation
 * through window.__RECURSION__ instead of relying on wall-clock timing.
 */

// Review screenshots go to the git-ignored test-results/ (writing them into docs/ bloated the repo on every run).
const SHOTS = 'test-results/smoke-shots';

type Hook = {
  mode: string;
  levelId: string;
  levels: string[];
  screen: string | null;
  timelineExpanded: boolean;
  lastResult: { stars: number; echoesUsed: number } | null;
  getState(): { tick: number; status: string; actors: { id: string; kind: string; x: number; z: number }[] };
  echoes(): number;
  hash(): number;
  loadLevel(id: string | number): string;
  runSolution(o?: { instant?: boolean }): { completed: boolean; status: string; tick: number; echoes: number };
  stepIdle(n: number): number;
  renderStats(): { drawCalls: number; triangles: number };
  progress(): { records: Record<string, { completions: number }> };
};

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__RECURSION__)`) as Promise<T>;

/** Waits for `n` animation frames (each renders the 3D view and updates the UI). */
const frames = (page: Page, n = 2): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const f = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

const player = (page: Page) => hook(page, (h) => h.getState().actors.find((a) => a.kind === 'player')!);

async function bootToMenu(page: Page): Promise<void> {
  await page.goto('/?quality=low');
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('menu');
}

test.describe.configure({ timeout: 240_000 });

test('menu → level 1 → move → record → rewind → echo replays → solve → complete → next level', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  // Main menu backdrop is the live simulation replaying the chamber's verified solution.
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(5);
  await frames(page, 2);
  await page.screenshot({ path: `${SHOTS}/integration-01-menu.png` });

  await page.getByTestId('menu-continue').click();
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 30_000 });
  expect(await hook(page, (h) => h.levelId)).toBe('L01-first-echo');
  await frames(page, 3);
  await page.screenshot({ path: `${SHOTS}/integration-02-intro.png` });
  await page.getByTestId('intro-begin').click();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
  await expect(page.getByTestId('hud')).toContainText('First Echo');

  // Move with the real keyboard path (KeyboardInput → InputSampler → TemporalGame.step).
  const start = await player(page);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await player(page)).x - start.x, { timeout: 60_000 }).toBeGreaterThan(1200);
  await page.keyboard.up('KeyD');
  await frames(page, 2);
  await page.screenshot({ path: `${SHOTS}/integration-03-playing.png` });

  // R: end the take → rewind → the recording becomes Echo 1.
  const tickBefore = await hook(page, (h) => h.getState().tick);
  expect(tickBefore).toBeGreaterThan(0);
  await page.keyboard.press('KeyR');
  await expect.poll(() => hook(page, (h) => h.echoes())).toBe(1);
  const echoStart = await hook(page, (h) => h.getState().actors.find((a) => a.kind === 'echo')!);
  expect(echoStart.id).toMatch(/^echo:/);
  expect(echoStart.x).toBeLessThan(start.x + 600); // back at the spawn: the world was reset
  // The echo replays the recorded inputs and walks east again on its own.
  await expect
    .poll(async () => (await hook(page, (h) => h.getState().actors.find((a) => a.kind === 'echo')!)).x - echoStart.x, { timeout: 90_000 })
    .toBeGreaterThan(800);
  await frames(page, 2);
  await page.screenshot({ path: `${SHOTS}/integration-04-echo.png` });

  // Tab: timeline inspect (sim pauses), scrubbing renders snapshots.
  await page.keyboard.press('Tab');
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(true);
  const t0 = await hook(page, (h) => h.getState().tick);
  await frames(page, 3);
  expect(await hook(page, (h) => h.getState().tick)).toBe(t0);
  await page.screenshot({ path: `${SHOTS}/integration-05-timeline.png` });
  await page.keyboard.press('Tab');
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(false);

  // Hold Q: temporal preview fast-forwards the echoes' future (sim frozen, player idles in the preview).
  const tq = await hook(page, (h) => h.getState().tick);
  await page.keyboard.down('KeyQ');
  await frames(page, 4);
  expect(await hook(page, (h) => h.getState().tick)).toBe(tq);
  await page.screenshot({ path: `${SHOTS}/integration-05b-preview.png` });
  await page.keyboard.up('KeyQ');
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(tq);

  // Esc: pause menu; Esc again resumes.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  await frames(page, 2);
  await page.screenshot({ path: `${SHOTS}/integration-06-pause.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toHaveCount(0);

  // Solve through the debug hook: installs the verified echo loops and drives the final run deterministically.
  const solved = await hook(page, (h) => h.runSolution());
  expect(solved.completed).toBe(true);
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('complete');
  await expect(page.getByTestId('level-complete')).toBeVisible({ timeout: 60_000 });
  await frames(page, 3);
  await page.screenshot({ path: `${SHOTS}/integration-07-complete.png` });
  const progress = await hook(page, (h) => h.progress());
  expect(progress.records['L01-first-echo']?.completions).toBe(1);

  // Next chamber.
  await page.getByTestId('complete-next').click();
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 30_000 });
  expect(await hook(page, (h) => h.levelId)).toBe('L02-two-places');
  await page.getByTestId('intro-begin').click();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 90_000 }).toBeGreaterThan(50);
  await page.screenshot({ path: `${SHOTS}/integration-08-level2.png` });

  expect(errors).toEqual([]);
});

test('every campaign level loads, renders and completes with its verified solution', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  const ids = await hook(page, (h) => h.levels);
  expect(ids.length).toBeGreaterThanOrEqual(3);
  // SwiftShader needs ~25-40 s per chamber (load + frames + screenshot + solve): scale the budget with the campaign.
  test.setTimeout(120_000 + ids.length * 75_000);
  for (let i = 0; i < ids.length; i++) {
    const id = await page.evaluate(`window.__RECURSION__.loadLevel(${i})`);
    expect(id).toBe(ids[i]);
    await frames(page, 3);
    const stats = await hook(page, (h) => h.renderStats());
    expect(stats.drawCalls).toBeGreaterThan(20);
    // Let echoes appear mid-solution for the screenshot, then finish.
    await page.screenshot({ path: `${SHOTS}/integration-level-${String(i + 1).padStart(2, '0')}.png` });
    const r = await hook(page, (h) => h.runSolution());
    expect(r.completed, `${ids[i]} solution`).toBe(true);
    await frames(page, 2);
  }
  expect(errors).toEqual([]);
});

test('Continue restores saved echoes; Shift+R restarts the chamber', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  await page.getByTestId('menu-continue').click();
  await page.getByTestId('intro-begin').click();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
  await page.evaluate('window.__RECURSION__.stepIdle(30)');
  await page.keyboard.press('KeyR');
  await expect.poll(() => hook(page, (h) => h.echoes())).toBe(1);

  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('menu-continue')).toContainText('First Echo');
  await page.getByTestId('menu-continue').click();
  await page.getByTestId('intro-begin').click();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
  expect(await hook(page, (h) => h.echoes())).toBe(1);

  await page.keyboard.press('Shift+KeyR');
  await expect.poll(() => hook(page, (h) => h.echoes())).toBe(0);
  expect(errors).toEqual([]);
});
