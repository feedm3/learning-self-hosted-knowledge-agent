import { beforeAll, describe, expect, it } from 'vitest';
import { embedSingle } from '../../src/mastra/lib/embedder';
import { searchTopK, type RerankedHit } from '../../src/mastra/lib/chunk-store';
import { rerank } from '../../src/mastra/lib/rerank';
import { ollamaUp } from './helpers/ollama';
import { ingestFile, TEST_SLUG_MAP } from './helpers/pipeline';
import { writeFixturePdf } from './helpers/pdf';

// Scenario: the same fact is reported in two editions two years apart, with a
// different measured value each time. Retrieval must surface the *newer*
// edition — this is the whole point of the recency term in rerank().
//
// The two fixtures are word-for-word identical except for the measurement and
// the date, so their embeddings (and raw vector similarity to the query) are
// near-identical. With a 60-day half-life, a ~2-year age gap makes the recency
// factor differ by thousands of times — far more than any similarity noise —
// so the outcome is deterministic.

const OLD_FILE = '15-06-2024-test-bulletin.pdf';
const NEW_FILE = '15-06-2026-test-bulletin.pdf';
const NOW = new Date('2026-07-01T00:00:00Z');
const QUERY = 'Welche Wassertemperatur wurde im Freibad gemessen?';

function bulletin(celsius: number): string[][] {
  return [
    [
      'Die Gemeinde informiert über die jährliche Messung im Freibad.',
      `Bei der diesjährigen Messung im Freibad wurde die Wassertemperatur erfasst. Die gemessene Wassertemperatur betrug ${celsius} Grad Celsius.`,
    ],
  ];
}

describe.skipIf(!ollamaUp)('recency rerank picks the newer edition', () => {
  let hits: RerankedHit[];

  beforeAll(async () => {
    await ingestFile(await writeFixturePdf(OLD_FILE, bulletin(20)), TEST_SLUG_MAP);
    await ingestFile(await writeFixturePdf(NEW_FILE, bulletin(30)), TEST_SLUG_MAP);
    hits = await searchTopK(await embedSingle(QUERY), 5, { rerank: { now: NOW } });
  });

  it('ranks the 2026 edition first and returns its value (30)', () => {
    expect(hits[0].metadata.document_url).toBe(NEW_FILE);
    expect(hits[0].text).toContain('30');
  });

  it('proves recency — not similarity — decided the ranking', () => {
    const newHit = hits.find((h) => h.metadata.document_url === NEW_FILE)!;
    const oldHit = hits.find((h) => h.metadata.document_url === OLD_FILE)!;
    expect(newHit).toBeDefined();
    expect(oldHit).toBeDefined();

    // Raw vector similarity treats the two near-identical docs as a near-tie.
    const rawGap =
      Math.abs(newHit.raw_score - oldHit.raw_score) /
      Math.max(newHit.raw_score, oldHit.raw_score);
    expect(rawGap).toBeLessThan(0.15);

    // After the recency term is applied, the newer edition wins decisively.
    expect(newHit.score).toBeGreaterThan(oldHit.score * 5);

    // And with recency neutralised (infinite half-life), the decisive gap
    // collapses back to the raw near-tie — recency was doing the work.
    const withoutRecency = rerank(
      hits.map((h) => ({ id: h.id, score: h.raw_score, text: h.text, metadata: h.metadata })),
      { now: NOW, halfLifeDays: Number.POSITIVE_INFINITY },
    );
    const flatNew = withoutRecency.find((h) => h.metadata.document_url === NEW_FILE)!;
    const flatOld = withoutRecency.find((h) => h.metadata.document_url === OLD_FILE)!;
    expect(flatNew.score).toBeLessThan(flatOld.score * 5);
  });
});
