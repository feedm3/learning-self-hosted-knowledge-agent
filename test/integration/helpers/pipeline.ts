import { chunkDocument, type Chunk } from '../../../src/mastra/lib/chunker';
import { orderPage } from '../../../src/mastra/lib/column-sort';
import { embedTexts } from '../../../src/mastra/lib/embedder';
import { replaceDocumentChunks } from '../../../src/mastra/lib/chunk-store';
import {
  parseDocumentMetadata,
  type DocumentMetadata,
  type SlugMap,
} from '../../../src/mastra/lib/metadata';
import { parsePdf } from '../../../src/mastra/lib/pdf-parser';

// Slug map for generated fixtures. Kept here, not in production SLUG_MAP, so
// test-only editions never leak into shipping code.
export const TEST_SLUG_MAP: SlugMap = {
  'test-bulletin': { edition_title: 'Test-Bulletin', source_type: 'newspaper' },
};

// The real ingestion path, minus the Mastra workflow shell:
// parse -> order columns -> chunk -> embed (Ollama) -> upsert into LibSQL.
// Unlike ingestPdf.ts it skips the page-1 date cross-check — no test asserts it.
export async function ingestFile(
  filePath: string,
  slugMap?: SlugMap,
): Promise<{ meta: DocumentMetadata; chunks: Chunk[] }> {
  const meta = parseDocumentMetadata(filePath, slugMap);
  const parsed = await parsePdf(filePath);
  const orderedPages = parsed.pages.map(orderPage);
  const chunks = chunkDocument(orderedPages, meta);
  const vectors = await embedTexts(chunks.map((c) => c.text));
  await replaceDocumentChunks(chunks, vectors);
  return { meta, chunks };
}

// Splits a chunk's stored text back into its [prefix] line and body paragraphs.
export function splitChunkText(text: string): { prefix: string; paragraphs: string[] } {
  const firstNewline = text.indexOf('\n');
  const prefix = text.slice(0, firstNewline);
  const body = text.slice(firstNewline + 1);
  return { prefix, paragraphs: body.split('\n\n') };
}
