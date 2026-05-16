import { describe, expect, it } from 'vitest';
import { chunkDocument } from './chunker';
import type { OrderedPage } from './column-sort';
import type { DocumentMetadata } from './metadata';

const META: DocumentMetadata = {
  source_type: 'newspaper',
  published_at: '2026-01-15',
  edition_title: 'Der Kißlegger',
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
  it('produces no chunks for an empty document', () => {
    expect(chunkDocument([], META)).toEqual([]);
  });

  it('emits a single chunk with a page/edition prefix for short content', () => {
    const chunks = chunkDocument([page(1, ['Hallo Welt'])], META);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(`${PREFIX}\nHallo Welt`);
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[0].page_number).toBe(1);
  });

  it('carries document metadata onto every chunk', () => {
    const [chunk] = chunkDocument([page(1, ['Hallo Welt'])], META);
    expect(chunk).toMatchObject({
      source_type: 'newspaper',
      published_at: '2026-01-15',
      edition_no: 42,
      edition_title: 'Der Kißlegger',
      document_url: '15-01-2026-der-kisslegger.pdf',
    });
  });

  it('assigns monotonically increasing chunk_index across pages', () => {
    const chunks = chunkDocument(
      [page(1, ['Erste Seite']), page(2, ['Zweite Seite'])],
      META,
    );
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1]);
    expect(chunks.map((c) => c.page_number)).toEqual([1, 2]);
  });

  it('skips empty paragraphs instead of emitting blank chunks', () => {
    expect(chunkDocument([page(1, ['', '   '])], META)).toEqual([]);
  });

  it('splits a paragraph that exceeds the hard token cap into multiple chunks', () => {
    // ~5000 chars -> ~1250 tokens, well over the 800-token hard cap
    const longParagraph = 'Das ist ein vollständiger Satz. '.repeat(160);
    const chunks = chunkDocument([page(1, [longParagraph])], META);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.page_number === 1)).toBe(true);

    // Every resulting chunk must respect the ~800-token hard cap. estimateTokens
    // is ceil(chars / 4), so the body must stay at or below 3200 chars.
    for (const chunk of chunks) {
      const body = chunk.text.slice(chunk.text.indexOf('\n') + 1);
      expect(body.length).toBeLessThanOrEqual(3200);
    }
  });
});
