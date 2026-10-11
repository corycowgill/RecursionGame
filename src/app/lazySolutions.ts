/**
 * Lazy loader for `./solutions` (the attract replay / debug-solve solution compiler, which drags in the headless
 * test harness). Keeping it behind a dynamic import keeps the harness out of the boot path: the menu paints first,
 * then the chunk is fetched and the attract replay switches to the known solution.
 */
export type SolutionsModule = typeof import('./solutions');

let loaded: SolutionsModule | null = null;
let pending: Promise<SolutionsModule> | null = null;

/** The solutions module if it has finished loading, else null (never triggers a load). */
export function loadedSolutions(): SolutionsModule | null {
  return loaded;
}

/** Loads the solutions chunk once; concurrent and later calls share the same promise. A failed load can be retried. */
export function loadSolutions(): Promise<SolutionsModule> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import('./solutions').then(
    (m) => (loaded = m),
    (err: unknown) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}
