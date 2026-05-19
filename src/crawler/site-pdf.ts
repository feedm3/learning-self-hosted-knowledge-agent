import { parsePdf } from '../mastra/lib/pdf-parser';
import { orderPage } from '../mastra/lib/column-sort';
import { chunkDocument, type Chunk } from '../mastra/lib/chunker';
import type { DocumentMetadata } from '../mastra/lib/metadata';

// Parses a website-linked PDF (already cached on disk) into website chunks. The
// PDF text layer goes through the same pipeline as the newspaper editions; only
// the metadata differs — no edition, no publication date, document_title from
// the anchor link text that pointed at the PDF.
export async function chunkSitePdf(
  filePath: string,
  url: string,
  anchorText: string,
): Promise<Chunk[]> {
  const parsed = await parsePdf(filePath);
  const orderedPages = parsed.pages.map(orderPage);
  const meta: DocumentMetadata = {
    source_type: 'website',
    published_at: null,
    document_title: anchorText.trim() || url,
    edition_no: null,
    document_url: url,
  };
  return chunkDocument(orderedPages, meta);
}
