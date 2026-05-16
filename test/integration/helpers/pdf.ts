import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll } from 'vitest';

// Generates simple, single-column PDFs from plain text so integration tests
// can assert against content they fully control. Each drawn line becomes one
// extractable text item; paragraphs are separated by a wide vertical gap so
// column-sort groups them the same way it groups real newspaper paragraphs.

const PAGE_WIDTH = 595; // A4 in points
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const FONT_SIZE = 10;
const LINE_STEP = 13; // baseline-to-baseline within a paragraph
const PARAGRAPH_GAP = 20; // extra gap between paragraphs (well past column-sort's threshold)
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

export type PdfPage = string[]; // a page is a list of paragraphs

function wrapParagraph(
  text: string,
  font: import('pdf-lib').PDFFont,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) > CONTENT_WIDTH && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildPdf(pages: PdfPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const paragraphs of pages) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    for (let p = 0; p < paragraphs.length; p++) {
      if (p > 0) y -= PARAGRAPH_GAP;
      for (const line of wrapParagraph(paragraphs[p], font)) {
        if (y < MARGIN) {
          throw new Error('Fixture PDF page overflowed — shorten the fixture text');
        }
        page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
        y -= LINE_STEP;
      }
    }
  }

  return doc.save();
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), 'knowledge-agent-fixture-'));
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

// Writes a fixture PDF to a throwaway temp directory and returns its absolute
// path. The filename must satisfy the DD-MM-YYYY-<slug>.pdf ingestion contract.
export async function writeFixturePdf(
  filename: string,
  pages: PdfPage[],
): Promise<string> {
  const bytes = await buildPdf(pages);
  const filePath = path.join(fixtureDir, filename);
  writeFileSync(filePath, bytes);
  return filePath;
}
