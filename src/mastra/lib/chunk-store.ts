import { LibSQLVector } from '@mastra/libsql';
import { createClient, type Client } from '@libsql/client';
import { dataFileUrl } from './data-dir';
import type { Chunk } from './chunker';
import { EMBEDDING_DIMENSION } from './embedder';
import { rerank } from './rerank';
import {
  hitMetadataSchema,
  type RerankOptions,
  type RerankedHit,
  type SearchHit,
} from './search-types';

export const CHUNKS_INDEX = 'chunks';
const DB_URL = process.env.CHUNKS_DB_URL ?? dataFileUrl('chunks.db');

// 6x over-fetch gives the recency/source rerank a meaningful candidate pool
// without scanning the full corpus on every query.
export const DEFAULT_OVERFETCH_MULTIPLIER = 6;

export { hitSchema, rerankedHitSchema, hitMetadataSchema } from './search-types';
export type { SearchHit, RerankedHit, RerankOptions };

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

let cachedClient: Client | null = null;

function getRawClient(): Client {
  if (!cachedClient) {
    cachedClient = createClient({ url: DB_URL });
  }
  return cachedClient;
}

// Distinct document_urls of website documents in the index, for the crawl
// orphan sweep. Uses raw SQL because LibSQLVector exposes no way to enumerate
// stored metadata — its query API requires a vector and returns ranked hits.
export async function listWebsiteDocumentUrls(): Promise<string[]> {
  await ensureIndex();
  const result = await getRawClient().execute({
    sql: `SELECT DISTINCT json_extract(metadata, '$.document_url') AS document_url
          FROM ${CHUNKS_INDEX}
          WHERE json_extract(metadata, '$.source_type') = 'website'`,
    args: [],
  });
  return result.rows
    .map((row) => row.document_url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

// Removes every chunk belonging to one document. Used to sweep orphaned pages.
export async function deleteDocument(document_url: string): Promise<void> {
  await ensureIndex();
  await getChunkStore().deleteVectors({
    indexName: CHUNKS_INDEX,
    filter: { document_url },
  });
}

export interface SearchOptions {
  overFetchMultiplier?: number;
  rerank?: RerankOptions;
}

export async function searchTopK(
  queryVector: number[],
  topK: number,
  opts: SearchOptions = {},
): Promise<RerankedHit[]> {
  await ensureIndex();
  const overFetch = topK * (opts.overFetchMultiplier ?? DEFAULT_OVERFETCH_MULTIPLIER);
  const results = await getChunkStore().query({
    indexName: CHUNKS_INDEX,
    queryVector,
    topK: overFetch,
  });
  const hits: SearchHit[] = results.map((r) => {
    const parsed = hitMetadataSchema.parse(r.metadata);
    const { text, ...metadata } = parsed;
    return { id: r.id, score: r.score, text, metadata };
  });
  return rerank(hits, opts.rerank).slice(0, topK);
}
