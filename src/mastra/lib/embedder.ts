import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

export const EMBEDDING_DIMENSION = 1024;
const MODEL_ID = 'bge-m3';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1';
const BATCH_SIZE = 16;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;

let cached: ModelRouterEmbeddingModel | null = null;

function getModel(): ModelRouterEmbeddingModel {
  if (!cached) {
    cached = new ModelRouterEmbeddingModel({
      providerId: 'ollama',
      modelId: MODEL_ID,
      url: OLLAMA_URL,
      apiKey: 'not-needed',
    });
  }
  return cached;
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const model = getModel();
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await withRetry(() => model.doEmbed({ values: batch }));
    out.push(...batchEmbeddings.embeddings);
  }
  return out;
}

export async function embedSingle(value: string): Promise<number[]> {
  const [vec] = await embedTexts([value]);
  return vec;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) break;
      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
