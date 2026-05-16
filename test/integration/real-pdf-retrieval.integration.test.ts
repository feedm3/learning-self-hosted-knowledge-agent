import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchTopK } from '../../src/mastra/lib/chunk-store';
import { embedSingle } from '../../src/mastra/lib/embedder';
import { ollamaUp } from './helpers/ollama';
import { ingestFile, splitChunkText } from './helpers/pipeline';

// End-to-end retrieval over a real Kißlegg Amtsblatt: parse -> chunk -> embed
// -> store -> search, all on genuine German municipal text.
//
// Rather than hard-coding a domain term that may not be in this edition, the
// test is self-validating: it queries with a sentence taken from one specific
// chunk and asserts that same chunk comes back at the top.

const SAMPLE = path.resolve(
  __dirname,
  '../../docs/newspaper-samples/25-04-2026-der-kisslegger.pdf',
);

describe.skipIf(!ollamaUp)('retrieval over a real newspaper PDF', () => {
  it('retrieves the chunk a query sentence was taken from', async () => {
    const { meta, chunks } = await ingestFile(SAMPLE);
    expect(chunks.length).toBeGreaterThan(3);

    // Pick a mid-document chunk with enough body text to form a real query.
    const target = chunks
      .slice(Math.floor(chunks.length / 4), Math.floor((chunks.length * 3) / 4))
      .find((c) => splitChunkText(c.text).paragraphs.join(' ').length > 200);
    expect(target).toBeDefined();

    const body = splitChunkText(target!.text).paragraphs.join(' ');
    const query = body.slice(0, 200);

    const hits = await searchTopK(await embedSingle(query), 3);
    const expectedId = `${meta.document_url}#${target!.chunk_index}`;

    expect(hits.map((h) => h.id)).toContain(expectedId);
    expect(hits[0].id).toBe(expectedId);
  });
});
