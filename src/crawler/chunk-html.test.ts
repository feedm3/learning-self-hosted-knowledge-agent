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
  it('derives website document metadata from the page', () => {
    const doc = chunkHtmlPage(
      page([{ headingPath: ['A'], paragraphs: ['Kurzer Text.'] }], '2026-05-05'),
    );
    expect(doc.metadata).toEqual({
      source_type: 'website',
      published_at: '2026-05-05',
      edition_no: null,
      document_title: 'Test-Seite',
      document_url: URL,
    });
  });

  it('gives every body a null page number', () => {
    const doc = chunkHtmlPage(
      page([{ headingPath: ['A'], paragraphs: ['Kurzer Text.'] }]),
    );
    expect(doc.bodies.every((b) => b.page_number === null)).toBe(true);
  });

  it('carries the heading path into the body prefix', () => {
    const doc = chunkHtmlPage(
      page([{ headingPath: ['Service', 'Müll'], paragraphs: ['Abfuhrtermine.'] }]),
    );
    expect(doc.bodies[0].text).toBe(
      `[Test-Seite › Service › Müll – ${URL}]\nAbfuhrtermine.`,
    );
  });

  it('merges small consecutive sections under the same h1 into one body', () => {
    const doc = chunkHtmlPage(
      page([
        { headingPath: ['Rathaus'], paragraphs: ['Kurz eins.'] },
        { headingPath: ['Rathaus', 'Unterpunkt'], paragraphs: ['Kurz zwei.'] },
      ]),
    );
    expect(doc.bodies).toHaveLength(1);
    expect(doc.bodies[0].text).toContain('Kurz eins.');
    expect(doc.bodies[0].text).toContain('Kurz zwei.');
  });

  it('never merges sections across an h1 boundary', () => {
    const doc = chunkHtmlPage(
      page([
        { headingPath: ['Thema A'], paragraphs: ['Text A.'] },
        { headingPath: ['Thema B'], paragraphs: ['Text B.'] },
      ]),
    );
    expect(doc.bodies).toHaveLength(2);
  });

  it('splits a section larger than the hard cap into multiple bodies', () => {
    // ~5000 chars -> ~1250 tokens, well over the 800-token hard cap.
    const huge = 'Das ist ein vollständiger Satz. '.repeat(160);
    const doc = chunkHtmlPage(page([{ headingPath: ['Groß'], paragraphs: [huge] }]));
    expect(doc.bodies.length).toBeGreaterThan(1);
    for (const body of doc.bodies) {
      const text = body.text.slice(body.text.indexOf('\n') + 1);
      expect(text.length).toBeLessThanOrEqual(3200);
    }
  });
});
