// Probes the local Ollama server so embedding-dependent integration tests can
// skip themselves cleanly when infra isn't running (e.g. `pnpm run infra:dev`
// was never started). Parse-only tests don't use this.

const OLLAMA_V1_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1';

async function isOllamaUp(): Promise<boolean> {
  const base = OLLAMA_V1_URL.replace(/\/v1\/?$/, '');
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Probed once per test file; import and gate scenarios with `describe.skipIf`.
export const ollamaUp = await isOllamaUp();
