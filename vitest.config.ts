import { defineConfig } from 'vitest/config';

// Fast unit suite: pure functions only, no infra. Run with `pnpm test`.
// Integration tests live under test/integration/ and have their own config.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
