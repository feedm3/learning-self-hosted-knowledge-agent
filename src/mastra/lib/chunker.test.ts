import { describe, expect, it } from 'vitest';
import { chunkDocument, documentToChunks } from './chunker';
import type { OrderedPage } from './column-sort';
import type { DocumentMetadata } from './metadata';

const META: DocumentMetadata = {
  source_type: 'newspaper',
  published_at: '2026-01-15',
  document_title: 'Der Kißlegger',
  edition_no: 42,
  document_url: '15-01-2026-der-kisslegger.pdf',
};

const PREFIX = '[Der Kißlegger | Ausgabe 15. Januar 2026 | Seite 1]';

function page(page_number: number, texts: string[]): OrderedPage {
  return {
    page_number,
    paragraphs: texts.map((text) => ({ text, fontSizeMax: 10 })),
  };
}

describe('chunkDocument', () => {
  it('produces no chunk bodies for an empty document', () => {
    expect(chunkDocument([], META).bodies).toEqual([]);
  });

  it('carries the document metadata once, not per body', () => {
    expect(chunkDocument([page(1, ['Hallo Welt'])], META).metadata).toEqual(META);
  });

  it('emits a single body with a page/edition prefix for short content', () => {
    const { bodies } = chunkDocument([page(1, ['Hallo Welt'])], META);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].text).toBe(`${PREFIX}\nHallo Welt`);
    expect(bodies[0].page_number).toBe(1);
  });

  it('emits bodies in page order', () => {
    const { bodies } = chunkDocument(
      [page(1, ['Erste Seite']), page(2, ['Zweite Seite'])],
      META,
    );
    expect(bodies.map((b) => b.page_number)).toEqual([1, 2]);
  });

  it('skips empty paragraphs instead of emitting blank bodies', () => {
    expect(chunkDocument([page(1, ['', '   '])], META).bodies).toEqual([]);
  });

  it('splits a paragraph that exceeds the hard token cap into multiple bodies', () => {
    // ~5000 chars -> ~1250 tokens, well over the 800-token hard cap
    const longParagraph = 'Das ist ein vollständiger Satz. '.repeat(160);
    const { bodies } = chunkDocument([page(1, [longParagraph])], META);
    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies.every((b) => b.page_number === 1)).toBe(true);

    // Every resulting body must respect the ~800-token hard cap. estimateTokens
    // is ceil(chars / 4), so the text after the prefix must stay at or below
    // 3200 chars.
    for (const body of bodies) {
      const text = body.text.slice(body.text.indexOf('\n') + 1);
      expect(text.length).toBeLessThanOrEqual(3200);
    }
  });
});

describe('documentToChunks', () => {
  it('assigns monotonically increasing chunk_index across pages', () => {
    const doc = chunkDocument(
      [page(1, ['Erste Seite']), page(2, ['Zweite Seite'])],
      META,
    );
    const chunks = documentToChunks(doc);
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1]);
    expect(chunks.map((c) => c.page_number)).toEqual([1, 2]);
  });

  it('stamps the document metadata onto every chunk', () => {
    const [chunk] = documentToChunks(chunkDocument([page(1, ['Hallo Welt'])], META));
    expect(chunk).toMatchObject({
      source_type: 'newspaper',
      published_at: '2026-01-15',
      edition_no: 42,
      document_title: 'Der Kißlegger',
      document_url: '15-01-2026-der-kisslegger.pdf',
    });
  });

  it('produces no chunks for a document with no bodies', () => {
    expect(documentToChunks(chunkDocument([], META))).toEqual([]);
  });
});
