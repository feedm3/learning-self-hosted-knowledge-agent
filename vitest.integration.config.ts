import { defineConfig } from 'vitest/config';

// Integration suite: real PDF parsing, local Ollama embeddings, real LibSQL.
// Requires `pnpm run infra:dev` (Ollama). Tests that need Ollama skip
// themselves cleanly when it is unreachable. Run with `pnpm test:integration`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    // Embedding a document through a local model is slow on first run.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One scenario per file; run files serially so they don't contend for Ollama.
    fileParallelism: false,
  },
});
