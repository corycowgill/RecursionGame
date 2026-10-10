import { defineConfig } from 'vitest/config';

/**
 * Headless performance benchmark (`npm run bench`). Separate from `npm test` so timing-sensitive runs never make
 * the unit suite flaky. Single worker so measurements are not disturbed by parallel test files.
 */
export default defineConfig({
  test: {
    include: ['src/testing/benchmarks/**/*.bench.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
