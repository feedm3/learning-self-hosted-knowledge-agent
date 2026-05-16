import { describe, expect, it } from 'vitest';
import { searchTopK } from '../../src/mastra/lib/chunk-store';
import { embedSingle } from '../../src/mastra/lib/embedder';
import { ollamaUp } from './helpers/ollama';
import { ingestFile, TEST_SLUG_MAP } from './helpers/pipeline';
import { writeFixturePdf } from './helpers/pdf';

// A walkthrough of *why* embedding-based retrieval works: a query is matched by
// meaning, not by shared words. The fixture is a waste-collection notice. A
// reworded question that shares almost no vocabulary with it still scores far
// higher than an unrelated query — that gap is the embedding doing its job.
//
// `raw_score` is the pure cosine similarity from the vector store, before the
// recency/source rerank — so it isolates the embedding's contribution.

const FILE = '10-05-2026-test-bulletin.pdf';

const FIXTURE: string[][] = [
  [
    'Abfallkalender der Gemeinde fuer das laufende Jahr.',
    'Die Restmuelltonne wird in den geraden Kalenderwochen am Donnerstag ' +
      'geleert. Bitte stellen Sie die Tonne bis sieben Uhr morgens an den ' +
      'Strassenrand.',
  ],
];

// Shares almost no words with the fixture (Hausmuell vs Restmuell,
// herausstellen vs geleert) but means the same thing.
const REWORDED_QUERY = 'Wann muss ich meinen Hausmuell zur Abholung herausstellen?';
const UNRELATED_QUERY = 'Oeffnungszeiten des Hallenbads waehrend der Sommerferien.';

describe.skipIf(!ollamaUp)('walkthrough: embeddings match meaning, not words', () => {
  it('scores a reworded query far above an unrelated one', async () => {
    await ingestFile(await writeFixturePdf(FILE, FIXTURE), TEST_SLUG_MAP);

    const [reworded] = await searchTopK(await embedSingle(REWORDED_QUERY), 1);
    const [unrelated] = await searchTopK(await embedSingle(UNRELATED_QUERY), 1);

    // Both queries return the same (only) document — what differs is the score.
    expect(reworded.metadata.document_url).toBe(FILE);
    expect(unrelated.metadata.document_url).toBe(FILE);

    // The reworded question, despite different vocabulary, is a strong match...
    expect(reworded.raw_score).toBeGreaterThan(0.35);
    // ...and clearly stronger than a query about an unrelated topic.
    expect(reworded.raw_score).toBeGreaterThan(unrelated.raw_score);
    expect(reworded.raw_score - unrelated.raw_score).toBeGreaterThan(0.05);
  });
});
