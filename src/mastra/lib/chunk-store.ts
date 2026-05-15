import { LibSQLVector } from '@mastra/libsql';
import { z } from 'zod';
import { chunkSchema, type Chunk } from './chunker';
import { EMBEDDING_DIMENSION } from './embedder';

export const CHUNKS_INDEX = 'chunks';
const DB_URL = process.env.CHUNKS_DB_URL ?? 'file:./chunks.db';

export const hitMetadataSchema = chunkSchema;

export const hitSchema = z.object({
  id: z.string(),
  score: z.number(),
  text: z.string(),
  metadata: hitMetadataSchema.omit({ text: true }),
});

export type SearchHit = z.infer<typeof hitSchema>;

let cached: LibSQLVector | null = null;
let indexReady: Promise<void> | null = null;

export function getChunkStore(): LibSQLVector {
  if (!cached) {
    cached = new LibSQLVector({ id: 'chunks-vector', url: DB_URL });
  }
  return cached;
}

function ensureIndex(): Promise<void> {
  if (!indexReady) {
    indexReady = getChunkStore().createIndex({
      indexName: CHUNKS_INDEX,
      dimension: EMBEDDING_DIMENSION,
      metric: 'cosine',
    });
  }
  return indexReady;
}

export async function replaceDocumentChunks(
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  if (chunks.length === 0) return;
  if (chunks.length !== vectors.length) {
    throw new Error(
      `chunks.length (${chunks.length}) !== vectors.length (${vectors.length})`,
    );
  }
  const document_url = chunks[0].document_url;
  if (!chunks.every((c) => c.document_url === document_url)) {
    throw new Error('all chunks must share the same document_url');
  }

  await ensureIndex();
  const ids = chunks.map((c) => `${c.document_url}#${c.chunk_index}`);

  await getChunkStore().upsert({
    indexName: CHUNKS_INDEX,
    vectors,
    metadata: chunks,
    ids,
    deleteFilter: { document_url },
  });
}

export async function searchTopK(
  queryVector: number[],
  topK: number,
): Promise<SearchHit[]> {
  await ensureIndex();
  const results = await getChunkStore().query({
    indexName: CHUNKS_INDEX,
    queryVector,
    topK,
  });
  return results.map((r) => {
    const parsed = hitMetadataSchema.parse(r.metadata);
    const { text, ...metadata } = parsed;
    return { id: r.id, score: r.score, text, metadata };
  });
}
