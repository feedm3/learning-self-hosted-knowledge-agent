import { LibSQLVector } from '@mastra/libsql';
import { createClient, type Client } from '@libsql/client';
import { dataFileUrl } from './data-dir';
import { documentToChunks, type Document } from './chunker';
import { EMBEDDING_DIMENSION } from './embedder';
import {
  rerank,
  DEFAULT_RETRIEVAL_POLICY,
  type RetrievalPolicy,
} from './retrieval-policy';
import { hitMetadataSchema, type RerankedHit, type SearchHit } from './search-types';

export const CHUNKS_INDEX = 'chunks';
const DB_URL = process.env.CHUNKS_DB_URL ?? dataFileUrl('chunks.db');

// Raw client shares the DB file with LibSQLVector's writes (e.g. the orphan
// sweep reads while ingest upserts). Without a busy timeout, libsql fails
// immediately with SQLITE_BUSY on lock contention; wait instead. (@libsql/client 0.17.4)
const SQLITE_BUSY_TIMEOUT_MS = 5000;

export { hitSchema, rerankedHitSchema, hitMetadataSchema } from './search-types';
export type { SearchHit, RerankedHit };

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
  doc: Document,
  vectors: number[][],
): Promise<void> {
  if (doc.bodies.length === 0) return;
  if (doc.bodies.length !== vectors.length) {
    throw new Error(
      `bodies.length (${doc.bodies.length}) !== vectors.length (${vectors.length})`,
    );
  }

  const chunks = documentToChunks(doc);
  await ensureIndex();
  const ids = chunks.map((c) => `${c.document_url}#${c.chunk_index}`);

  await getChunkStore().upsert({
    indexName: CHUNKS_INDEX,
    vectors,
    metadata: chunks,
    ids,
    deleteFilter: { document_url: doc.metadata.document_url },
  });
}

let cachedClient: Client | null = null;

function getRawClient(): Client {
  if (!cachedClient) {
    cachedClient = createClient({ url: DB_URL, timeout: SQLITE_BUSY_TIMEOUT_MS });
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
  policy?: RetrievalPolicy;
  // Clock seam for recency decay; defaults to the current time.
  now?: Date;
}

export async function searchTopK(
  queryVector: number[],
  topK: number,
  opts: SearchOptions = {},
): Promise<RerankedHit[]> {
  await ensureIndex();
  const policy = opts.policy ?? DEFAULT_RETRIEVAL_POLICY;
  const overFetch = topK * policy.overFetchMultiplier;
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
  return rerank(hits, policy, opts.now).slice(0, topK);
}
