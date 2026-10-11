import { expect, test } from '@playwright/test';
import { bootToMenu, frames, hook, player, playLevel, readSave, trackErrors } from './helpers';

/**
 * Expanded end-to-end flows (smoke.spec.ts covers menu → play → record → rewind → echo replay → Q preview →
 * pause → complete → next level, the all-levels sweep and Continue/Shift+R). This file adds: level select and
 * locking, timeline open + scrubbing (mouse and keyboard) with the live sim frozen, the pause menu buttons,
 * settings persistence across reloads, and level-complete → level select progression.
 * Every test also asserts zero page errors / console errors.
 */

test.describe.configure({ timeout: 240_000 });

test('level select: fresh save shows chamber 1 open and chamber 2 locked; a chamber starts from its card', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  const levels = await hook(page, (h) => h.levels);
  await page.getByTestId('menu-levels').click();
  const select = page.getByTestId('level-select');
  await expect(select).toBeVisible();
  for (const id of levels) await expect(select.locator(`[data-level="${id}"]`)).toHaveCount(1);
  const first = select.locator(`[data-level="${levels[0]}"]`);
  const second = select.locator(`[data-level="${levels[1]}"]`);
  await expect(first).not.toHaveAttribute('aria-disabled', 'true');
  await expect(second).toHaveAttribute('aria-disabled', 'true');
  await expect(second).toHaveAttribute('aria-label', /Locked/);

  // A locked chamber refuses to start.
  await second.click();
  await frames(page, 2);
  await expect(select).toBeVisible();
  expect(await hook(page, (h) => h.mode)).toBe('menu');

  await first.click();
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 30_000 });
  expect(await hook(page, (h) => h.levelId)).toBe(levels[0]);
  await page.getByTestId('intro-begin').click();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('timeline: Tab freezes the sim; scrubbing by keyboard and mouse renders past snapshots; Enter returns to live', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  await playLevel(page, 0);
  // Walk east for a while so the past (tick 0) looks clearly different from the present.
  const start = await player(page);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await player(page)).x - start.x, { timeout: 90_000 }).toBeGreaterThan(1500);
  await page.keyboard.up('KeyD');

  await page.keyboard.press('Tab');
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(true);
  const frozen = await hook(page, (h) => h.getState().tick);
  const stage = page.locator('.rx-tl-stage');
  await expect(stage).toHaveAttribute('aria-valuetext', /^Live/);
  // Spy on the snapshots the frame loop asks for: it only calls getSnapshotAt to choose the view it renders.
  await page.evaluate(() => {
    const g = (window as unknown as { __RECURSION__: { game: { getSnapshotAt(t: number): unknown } } }).__RECURSION__.game;
    const calls: number[] = [];
    (window as unknown as { __snapCalls: number[] }).__snapCalls = calls;
    const orig = g.getSnapshotAt.bind(g);
    g.getSnapshotAt = (t: number) => {
      calls.push(t);
      return orig(t);
    };
  });
  const snapCalls = (): Promise<number[]> => page.evaluate(() => (window as unknown as { __snapCalls: number[] }).__snapCalls.slice());
  await frames(page, 3);
  await test.info().attach('timeline-live.png', { body: await page.screenshot(), contentType: 'image/png' });

  // Keyboard scrub to the very start.
  await stage.focus();
  await page.keyboard.press('Home');
  await expect(stage).toHaveAttribute('aria-valuenow', '0');
  await expect(stage).toHaveAttribute('aria-valuetext', /^Preview/);
  await expect(page.locator('.rx-scrubhead')).not.toHaveAttribute('hidden', /.*/); // shown (sits on the left edge at tick 0)
  await expect.poll(snapCalls, { message: 'the 3D view renders the tick-0 snapshot' }).toContain(0);
  await frames(page, 2);
  await test.info().attach('timeline-scrub-tick0.png', { body: await page.screenshot(), contentType: 'image/png' });
  expect(await hook(page, (h) => h.getState().tick)).toBe(frozen); // scrubbing never moves the live sim

  // Arrow keys step through time.
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await stage.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  const stepped = Number(await stage.getAttribute('aria-valuenow'));
  await expect.poll(snapCalls).toContain(stepped);
  await page.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('aria-valuetext', /^Live/);

  // Mouse drag scrub: press near the left edge of the stage, drag right, release → back to live.
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.02, box.y + box.height / 2);
  await page.mouse.down();
  await expect(stage).toHaveAttribute('aria-valuetext', /^Preview/);
  const a = Number(await stage.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height / 2, { steps: 4 });
  await expect.poll(async () => Number(await stage.getAttribute('aria-valuenow'))).toBeGreaterThan(a);
  await page.mouse.up();
  await expect(stage).toHaveAttribute('aria-valuetext', /^Live/);
  expect(await hook(page, (h) => h.getState().tick)).toBe(frozen);

  // Closing the timeline resumes the simulation.
  await page.keyboard.press('Tab');
  await expect.poll(() => hook(page, (h) => h.timelineExpanded)).toBe(false);
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(frozen);
  expect(errors).toEqual([]);
});

test('pause menu: Resume continues, Restart clears echoes, Main menu returns to the title', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  await playLevel(page, 0);
  await page.evaluate('window.__RECURSION__.stepIdle(40)');
  await page.keyboard.press('KeyR');
  await expect.poll(() => hook(page, (h) => h.echoes())).toBe(1);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  const t = await hook(page, (h) => h.getState().tick);
  await frames(page, 3);
  expect(await hook(page, (h) => h.getState().tick)).toBe(t); // paused
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause')).toHaveCount(0);
  await expect.poll(() => hook(page, (h) => h.getState().tick), { timeout: 60_000 }).toBeGreaterThan(t);
  expect(await hook(page, (h) => h.echoes())).toBe(1);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-restart').click();
  await expect(page.getByTestId('pause')).toHaveCount(0);
  await expect.poll(() => hook(page, (h) => h.echoes())).toBe(0);
  expect(await hook(page, (h) => h.getState().tick)).toBeLessThan(30);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-quit').click();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('menu');
  expect(errors).toEqual([]);
});

test('settings persist across a reload (volume, reduced motion, quality preset)', async ({ page }) => {
  const errors = trackErrors(page);
  // No ?quality= override here: a URL override locks the Settings quality selector (checked at the end).
  await bootToMenu(page, '');
  await page.getByTestId('menu-settings').click();
  const settings = page.getByTestId('settings');
  await expect(settings).toBeVisible();

  await settings.getByRole('tab', { name: 'Display' }).click();
  await settings.getByRole('group', { name: 'Quality preset' }).getByRole('button', { name: 'Medium' }).click();
  await settings.getByRole('tab', { name: 'Audio' }).click();
  const music = settings.getByLabel('Music volume');
  await music.evaluate((el: HTMLInputElement) => {
    el.value = '25';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settings.getByRole('tab', { name: 'Accessibility' }).click();
  const reduced = settings.getByRole('switch', { name: 'Reduced motion' });
  const wasReduced = (await reduced.getAttribute('aria-checked')) === 'true';
  await reduced.click();

  await expect
    .poll(async () => (await readSave(page))?.['settings'] as Record<string, unknown> | undefined)
    .toMatchObject({ musicVolume: 25, reducedMotion: !wasReduced, quality: 'medium' });

  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  const saved = (await readSave(page))?.['settings'] as Record<string, unknown>;
  expect(saved).toMatchObject({ musicVolume: 25, reducedMotion: !wasReduced, quality: 'medium' });
  await page.getByTestId('menu-settings').click();
  await settings.getByRole('tab', { name: 'Audio' }).click();
  await expect(settings.getByLabel('Music volume')).toHaveValue('25');
  await settings.getByRole('tab', { name: 'Accessibility' }).click();
  await expect(settings.getByRole('switch', { name: 'Reduced motion' })).toHaveAttribute('aria-checked', String(!wasReduced));
  await settings.getByRole('tab', { name: 'Display' }).click();
  await expect(settings.getByRole('group', { name: 'Quality preset' }).getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');

  // A ?quality= URL override is shown as the active preset and locks the selector; the saved preset is untouched.
  await bootToMenu(page, '?quality=low');
  await page.getByTestId('menu-settings').click();
  await settings.getByRole('tab', { name: 'Display' }).click();
  const group = settings.getByRole('group', { name: 'Quality preset' });
  await expect(group.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'Medium' })).toBeDisabled();
  expect(((await readSave(page))?.['settings'] as Record<string, unknown>)['quality']).toBe('medium');
  expect(errors).toEqual([]);
});

test('level complete → level select shows the chamber completed and unlocks the next one', async ({ page }) => {
  const errors = trackErrors(page);
  await bootToMenu(page);
  const levels = await hook(page, (h) => h.levels);
  await playLevel(page, 0);
  const r = await hook(page, (h) => h.runSolution());
  expect(r.completed).toBe(true);
  await expect(page.getByTestId('level-complete')).toBeVisible({ timeout: 60_000 });
  const result = await hook(page, (h) => h.lastResult);
  expect(result?.stars).toBeGreaterThanOrEqual(1);
  await page.getByTestId('complete-levels').click();
  const select = page.getByTestId('level-select');
  await expect(select).toBeVisible({ timeout: 30_000 });
  await expect(select.locator(`[data-level="${levels[0]}"]`)).toHaveAttribute('aria-label', /Completed/);
  await expect(select.locator(`[data-level="${levels[1]}"]`)).not.toHaveAttribute('aria-disabled', 'true');
  await select.locator(`[data-level="${levels[1]}"]`).click();
  await expect(page.getByTestId('level-intro')).toBeVisible({ timeout: 30_000 });
  expect(await hook(page, (h) => h.levelId)).toBe(levels[1]);
  expect(errors).toEqual([]);
});
