import { beforeAll, describe, expect, it } from 'vitest';
import { chunkDocument, type Chunk } from '../../src/mastra/lib/chunker';
import { orderPage } from '../../src/mastra/lib/column-sort';
import { parseDocumentMetadata } from '../../src/mastra/lib/metadata';
import { parsePdf } from '../../src/mastra/lib/pdf-parser';
import { splitChunkText, TEST_SLUG_MAP } from './helpers/pipeline';
import { writeFixturePdf } from './helpers/pdf';

// A walkthrough of how a PDF becomes retrievable chunks. It runs the real
// parse -> column-sort -> chunk pipeline on a PDF whose structure we designed,
// then asserts the *properties* the chunker guarantees. No Ollama: chunking is
// pre-embedding, so this runs with infra down.
//
// Fixture structure:
//   Page 1 — 12 short paragraphs. Small enough to be grouped together, so the
//            page yields several multi-paragraph chunks with overlap.
//   Page 2 — one deliberately over-long paragraph, which must be sentence-split.

const FILE = '01-03-2026-test-bulletin.pdf';

const SHORT_PARAGRAPHS = Array.from({ length: 12 }, (_, i) =>
  `Mitteilung Nummer ${i + 1}: Die Gemeindeverwaltung weist darauf hin, dass die ` +
  `folgenden Hinweise fuer alle Buergerinnen und Buerger im aktuellen ` +
  `Mitteilungsblatt von Bedeutung sind und sorgfaeltig gelesen werden sollten. ` +
  `Bei Rueckfragen steht das Buergerbuero gerne zur Verfuegung.`,
);

const LONG_PARAGRAPH = Array.from({ length: 22 }, () =>
  'Die Gemeinde informiert die Buergerinnen und Buerger ausfuehrlich ueber die ' +
  'anstehenden Bauarbeiten in der Hauptstrasse sowie ueber die damit ' +
  'verbundenen Sperrungen und Umleitungen.',
).join(' ');

describe('walkthrough: how a PDF becomes chunks', () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    const filePath = await writeFixturePdf(FILE, [SHORT_PARAGRAPHS, [LONG_PARAGRAPH]]);
    const meta = parseDocumentMetadata(filePath, TEST_SLUG_MAP);
    const parsed = await parsePdf(filePath);
    chunks = chunkDocument(parsed.pages.map(orderPage), meta);
  });

  it('produces more chunks than pages — content is split, not page-per-chunk', () => {
    expect(chunks.length).toBeGreaterThan(2);
  });

  it('prefixes every chunk with its edition, date and page', () => {
    for (const chunk of chunks) {
      const { prefix } = splitChunkText(chunk.text);
      expect(prefix).toMatch(/^\[Test-Bulletin \| Ausgabe .+ \| Seite \d+\]$/);
    }
  });

  it('groups several small paragraphs into one chunk', () => {
    const multiParagraph = chunks.filter(
      (c) => splitChunkText(c.text).paragraphs.length > 1,
    );
    expect(multiParagraph.length).toBeGreaterThan(0);
  });

  it('keeps every chunk under the hard token cap (~3200 chars of body)', () => {
    for (const chunk of chunks) {
      const body = splitChunkText(chunk.text).paragraphs.join('\n\n');
      expect(body.length).toBeLessThanOrEqual(3200);
    }
  });

  it('overlaps consecutive chunks so context is not lost at the boundary', () => {
    let overlapFound = false;
    for (let i = 0; i + 1 < chunks.length; i++) {
      if (chunks[i].page_number !== chunks[i + 1].page_number) continue;
      const prev = splitChunkText(chunks[i].text).paragraphs;
      const next = splitChunkText(chunks[i + 1].text).paragraphs;
      if (prev[prev.length - 1] === next[0]) overlapFound = true;
    }
    expect(overlapFound).toBe(true);
  });

  it('never lets a chunk span two pages', () => {
    const pageNumbers = chunks.map((c) => c.page_number);
    expect(pageNumbers).toEqual([...pageNumbers].sort((a, b) => a - b));
    expect(new Set(pageNumbers)).toEqual(new Set([1, 2]));
  });

  it('sentence-splits a single over-long paragraph into multiple chunks', () => {
    const page2 = chunks.filter((c) => c.page_number === 2);
    expect(page2.length).toBeGreaterThan(1);
  });
});
