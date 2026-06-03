import { defineConfig } from 'evalite/config';

// Eval harness config. See ADR 0006.
// Runs on demand (`pnpm run eval`) — no CI gate, so no scoreThreshold.
export default defineConfig({
  // Each eval case runs a local embedding and one or two cloud LLM calls.
  testTimeout: 120_000,
  // Keep concurrency modest so we don't hammer the local Ollama or OpenRouter.
  maxConcurrency: 3,
  // Eval logic and the agent/search code it exercises live outside the
  // .eval.ts files — rerun in watch mode when they change.
  forceRerunTriggers: ['src/**/*.ts', 'evals/**/*.ts'],
});
