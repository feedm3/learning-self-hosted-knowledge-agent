import { describe, expect, it } from 'vitest';
import { chunkHtmlPage, buildWebsitePrefix } from './chunk-html';
import type { ExtractedPage, Section } from './extract-html';

const URL = 'https://www.kisslegg.de/buerger/seite';

function page(sections: Section[], publishedAt: string | null = null): ExtractedPage {
  return {
    url: URL,
    documentTitle: 'Test-Seite',
    publishedAt,
    sections,
    links: [],
    pdfLinks: [],
  };
}

describe('buildWebsitePrefix', () => {
  it('joins title and heading path with › and appends the URL', () => {
    expect(buildWebsitePrefix('Test-Seite', ['Service', 'Öffnungszeiten'], URL)).toBe(
      `[Test-Seite › Service › Öffnungszeiten – ${URL}]`,
    );
  });
});

describe('chunkHtmlPage', () => {
  it('tags every chunk as a website chunk with no page number', () => {
    const [chunk] = chunkHtmlPage(
      page([{ headingPath: ['A'], paragraphs: ['Kurzer Text.'] }], '2026-05-05'),
    );
    expect(chunk).toMatchObject({
      source_type: 'website',
      page_number: null,
      edition_no: null,
      published_at: '2026-05-05',
      document_title: 'Test-Seite',
      document_url: URL,
    });
  });

  it('carries the heading path into the chunk prefix', () => {
    const [chunk] = chunkHtmlPage(
      page([{ headingPath: ['Service', 'Müll'], paragraphs: ['Abfuhrtermine.'] }]),
    );
    expect(chunk.text).toBe(
      `[Test-Seite › Service › Müll – ${URL}]\nAbfuhrtermine.`,
    );
  });

  it('merges small consecutive sections under the same h1 into one chunk', () => {
    const chunks = chunkHtmlPage(
      page([
        { headingPath: ['Rathaus'], paragraphs: ['Kurz eins.'] },
        { headingPath: ['Rathaus', 'Unterpunkt'], paragraphs: ['Kurz zwei.'] },
      ]),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Kurz eins.');
    expect(chunks[0].text).toContain('Kurz zwei.');
  });

  it('never merges sections across an h1 boundary', () => {
    const chunks = chunkHtmlPage(
      page([
        { headingPath: ['Thema A'], paragraphs: ['Text A.'] },
        { headingPath: ['Thema B'], paragraphs: ['Text B.'] },
      ]),
    );
    expect(chunks).toHaveLength(2);
  });

  it('splits a section larger than the hard cap into multiple chunks', () => {
    // ~5000 chars -> ~1250 tokens, well over the 800-token hard cap.
    const huge = 'Das ist ein vollständiger Satz. '.repeat(160);
    const chunks = chunkHtmlPage(page([{ headingPath: ['Groß'], paragraphs: [huge] }]));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const body = chunk.text.slice(chunk.text.indexOf('\n') + 1);
      expect(body.length).toBeLessThanOrEqual(3200);
    }
  });

  it('assigns monotonically increasing chunk_index', () => {
    const chunks = chunkHtmlPage(
      page([
        { headingPath: ['A'], paragraphs: ['eins'] },
        { headingPath: ['B'], paragraphs: ['zwei'] },
      ]),
    );
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1]);
  });
});
