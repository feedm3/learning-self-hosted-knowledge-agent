import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { orderPage } from '../../src/mastra/lib/column-sort';
import { parsePdf } from '../../src/mastra/lib/pdf-parser';

// Parses a real Kißlegg Amtsblatt. The column-sort unit tests use synthetic
// geometry; this test is the only thing that exercises the parser + column
// ordering against an actual multi-column newspaper PDF — so it catches an
// `unpdf` upgrade or a layout assumption breaking on real input.
//
// No Ollama needed: this is parse-only, so it runs even with infra down.

const SAMPLE = path.resolve(
  __dirname,
  '../../docs/newspaper-samples/25-04-2026-der-kisslegger.pdf',
);

describe('parsing a real newspaper PDF', () => {
  it('extracts text items across multiple pages', async () => {
    const parsed = await parsePdf(SAMPLE);

    expect(parsed.pages.length).toBeGreaterThan(1);
    const totalItems = parsed.pages.reduce((n, p) => n + p.items.length, 0);
    expect(totalItems).toBeGreaterThan(100);
  });

  it('orders pages into non-empty, readable paragraphs', async () => {
    const parsed = await parsePdf(SAMPLE);
    const orderedPages = parsed.pages.map(orderPage);

    const paragraphs = orderedPages.flatMap((p) => p.paragraphs);
    expect(paragraphs.length).toBeGreaterThan(0);

    // At least some paragraphs should be real running text, not stray fragments.
    const substantial = paragraphs.filter((p) => p.text.length > 80);
    expect(substantial.length).toBeGreaterThan(0);

    // Page numbers are preserved and ascending.
    const pageNumbers = orderedPages.map((p) => p.page_number);
    expect(pageNumbers).toEqual([...pageNumbers].sort((a, b) => a - b));
  });
});
