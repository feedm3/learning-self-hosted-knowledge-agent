import type { Document } from './chunker';
import { embedTexts } from './embedder';
import { replaceDocumentChunks } from './chunk-store';

// Indexes one document: embeds its chunk bodies locally and upserts them into
// the combined chunk index, replacing any earlier chunks of the same document.
// The shared tail of every ingestion path — newspaper PDF, website HTML,
// website PDF.
export async function indexDocument(doc: Document): Promise<void> {
  if (doc.bodies.length === 0) return;
  const vectors = await embedTexts(doc.bodies.map((b) => b.text));
  await replaceDocumentChunks(doc, vectors);
}
