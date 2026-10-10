import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
