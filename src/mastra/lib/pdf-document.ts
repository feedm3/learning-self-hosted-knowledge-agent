import { checkDateAgainstPageOne, type DocumentMetadata } from './metadata';
import { parsePdf } from './pdf-parser';
import { orderPage } from './column-sort';
import { chunkDocument, type Document } from './chunker';

export interface PdfDocumentResult {
  document: Document;
  // Set when the document carries a publication date that disagrees with the
  // date printed on page 1. Null for dateless documents and for matching dates.
  page_date_warning: string | null;
}

// The single seam both ingestion paths use to turn a PDF file into a document:
// parse the text layer, column-sort each page, chunk, and — for dated
// documents — cross-check the expected date against the date printed on page 1.
export async function pdfFileToDocument(
  filePath: string,
  meta: DocumentMetadata,
): Promise<PdfDocumentResult> {
  const parsed = await parsePdf(filePath);
  const orderedPages = parsed.pages.map(orderPage);

  let page_date_warning: string | null = null;
  const pageOne = orderedPages[0];
  if (pageOne && meta.published_at) {
    const pageOneText = pageOne.paragraphs.map((p) => p.text).join('\n');
    const check = checkDateAgainstPageOne(meta.published_at, pageOneText);
    if (!check.ok) {
      page_date_warning = `Filename date ${meta.published_at} differs from page-1 date ${check.found}`;
    }
  }

  return { document: chunkDocument(orderedPages, meta), page_date_warning };
}
