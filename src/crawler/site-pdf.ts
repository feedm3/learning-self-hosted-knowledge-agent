import { pdfFileToDocument } from '../mastra/lib/pdf-document';
import type { Document } from '../mastra/lib/chunker';
import type { DocumentMetadata } from '../mastra/lib/metadata';

// Turns a website-linked PDF (already cached on disk) into a website document.
// It runs through the same PDF extraction seam as the newspaper editions; only
// the metadata differs — no edition, no publication date, document_title from
// the anchor link text that pointed at the PDF.
export async function sitePdfToDocument(
  filePath: string,
  url: string,
  anchorText: string,
): Promise<Document> {
  const meta: DocumentMetadata = {
    source_type: 'website',
    published_at: null,
    document_title: anchorText.trim() || url,
    edition_no: null,
    document_url: url,
  };
  const { document } = await pdfFileToDocument(filePath, meta);
  return document;
}
