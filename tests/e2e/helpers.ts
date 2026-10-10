import { expect, type Page } from '@playwright/test';

/**
 * Shared Playwright helpers. Headless Chromium renders WebGL on SwiftShader (a few frames per second), so tests
 * poll the deterministic simulation through window.__RECURSION__ instead of relying on wall-clock timing.
 */

export type Hook = {
  mode: string;
  levelId: string;
  levels: string[];
  screen: string | null;
  timelineExpanded: boolean;
  lastResult: { stars: number; echoesUsed: number; ticks: number } | null;
  getState(): { tick: number; status: string; actors: { id: string; kind: string; x: number; z: number }[] };
  echoes(): number;
  hash(): number;
  loadLevel(id: string | number): string;
  startLevel(id: string | number): string;
  goMenu(): void;
  runSolution(o?: { instant?: boolean }): { completed: boolean; status: string; tick: number; echoes: number };
  stepIdle(n: number): number;
  commit(): void;
  restart(): void;
  renderStats(): { drawCalls: number; triangles: number; [k: string]: unknown };
  progress(): { records: Record<string, { completions: number }> };
};

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Runs `fn` against window.__RECURSION__ in the page (fn is serialized: no closures over test variables). */
export const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__RECURSION__)`) as Promise<T>;

/** Waits for `n` animation frames (each renders the 3D view and updates the UI). */
export const frames = (page: Page, n = 2): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const f = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

export const player = (page: Page): Promise<{ id: string; kind: string; x: number; z: number }> =>
  hook(page, (h) => h.getState().actors.find((a) => a.kind === 'player')!);

export async function bootToMenu(page: Page, query = '?quality=low'): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('menu');
}

/** Loads a level straight into play (skips the intro card) and waits until the sim is running. */
export async function playLevel(page: Page, index: number): Promise<void> {
  await page.evaluate(`window.__RECURSION__.loadLevel(${index})`);
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
}

/** Reads the parsed save from localStorage. */
export const readSave = (page: Page): Promise<Record<string, unknown> | null> =>
  page.evaluate(() => {
    const t = localStorage.getItem('recursion.save');
    return t ? (JSON.parse(t) as Record<string, unknown>) : null;
  });
