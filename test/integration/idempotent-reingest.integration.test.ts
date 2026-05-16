import { describe, expect, it } from 'vitest';
import { CHUNKS_INDEX, getChunkStore } from '../../src/mastra/lib/chunk-store';
import { ollamaUp } from './helpers/ollama';
import { ingestFile, TEST_SLUG_MAP } from './helpers/pipeline';
import { writeFixturePdf } from './helpers/pdf';

// Scenario: the same edition is ingested twice (e.g. a re-run, or a corrected
// re-upload). replaceDocumentChunks passes deleteFilter: { document_url }, so a
// re-ingest must *replace* the document's chunks, never duplicate them.

const FILE = '01-03-2026-test-bulletin.pdf';

function pages(): string[][] {
  return [
    [
      'Die Gemeinde lädt zur nächsten öffentlichen Gemeinderatssitzung ein.',
      'Auf der Tagesordnung stehen der Haushaltsplan und die Sanierung der Grundschule.',
      'Anträge können bis eine Woche vor der Sitzung im Rathaus eingereicht werden.',
    ],
  ];
}

async function indexCount(): Promise<number> {
  const stats = await getChunkStore().describeIndex({ indexName: CHUNKS_INDEX });
  return stats.count;
}

describe.skipIf(!ollamaUp)('re-ingesting a document replaces its chunks', () => {
  it('does not duplicate chunks when the same file is ingested twice', async () => {
    const filePath = await writeFixturePdf(FILE, pages());

    const first = await ingestFile(filePath, TEST_SLUG_MAP);
    expect(await indexCount()).toBe(first.chunks.length);

    // After a second ingest the index count is unchanged — chunk ids are
    // deterministic (document_url#chunk_index), so the upsert overwrites in
    // place rather than appending a duplicate set.
    const second = await ingestFile(filePath, TEST_SLUG_MAP);
    expect(await indexCount()).toBe(second.chunks.length);
  });
});
