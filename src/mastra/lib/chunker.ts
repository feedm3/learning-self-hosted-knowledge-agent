import { z } from 'zod';
import type { OrderedPage } from './column-sort';
import {
  documentMetadataSchema,
  germanFormatDate,
  type DocumentMetadata,
} from './metadata';

// The stored shape of one chunk in the vector index: a chunk body with the
// document metadata stamped onto it. Built only at the storage edge, by
// documentToChunks.
export const chunkSchema = z.object({
  text: z.string(),
  chunk_index: z.number().int().nonnegative(),
  page_number: z.number().int().positive().nullable(),
  source_type: z.enum(['newspaper', 'website']),
  published_at: z.string().nullable(),
  edition_no: z.number().nullable(),
  document_title: z.string(),
  document_url: z.string(),
});

export type Chunk = z.infer<typeof chunkSchema>;

// One retrievable unit as it flows through ingestion, before document metadata
// is stamped on. chunk_index is not carried — it is positional, assigned when
// the document is flattened for storage.
export const chunkBodySchema = z.object({
  text: z.string(),
  page_number: z.number().int().positive().nullable(),
});

export type ChunkBody = z.infer<typeof chunkBodySchema>;

// A document as it flows through ingestion: its metadata once, plus its ordered
// chunk bodies. Both ingestion paths (PDF, HTML) produce this shape; the flat
// per-chunk records are derived from it at storage.
export const documentSchema = z.object({
  metadata: documentMetadataSchema,
  bodies: z.array(chunkBodySchema),
});

export type Document = z.infer<typeof documentSchema>;

export const TARGET_TOKENS = 600;
const HARD_CAP_TOKENS = 800;
const OVERLAP_TOKENS = 80;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function buildPrefix(meta: DocumentMetadata, page_number: number): string {
  if (meta.source_type === 'newspaper' && meta.published_at) {
    return `[${meta.document_title} | Ausgabe ${germanFormatDate(meta.published_at)} | Seite ${page_number}]`;
  }
  return `[${meta.document_title} – ${meta.document_url} | Seite ${page_number}]`;
}

// Token-packs paragraphs into chunk bodies of ~600 tokens (hard cap 800), with
// an ~80-token overlap paragraph carried into the next body so context that
// straddles a boundary survives. A paragraph over the hard cap is sentence-split
// and each slice stands alone.
export function packParagraphs(paragraphs: string[]): string[] {
  const bodies: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  const flush = (): void => {
    if (buf.length === 0) return;
    bodies.push(buf.join('\n\n').trim());
    const last = buf[buf.length - 1];
    buf = estimateTokens(last) <= OVERLAP_TOKENS ? [last] : [];
    bufTokens = buf.reduce((sum, p) => sum + estimateTokens(p), 0);
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > HARD_CAP_TOKENS) {
      flush();
      for (const slice of splitLongParagraph(para)) bodies.push(slice);
      continue;
    }
    if (bufTokens + paraTokens > HARD_CAP_TOKENS) flush();
    buf.push(para);
    bufTokens += paraTokens;
    if (bufTokens >= TARGET_TOKENS) flush();
  }
  if (buf.length > 0) bodies.push(buf.join('\n\n').trim());
  return bodies.filter((b) => b.length > 0);
}

export function chunkDocument(
  pages: OrderedPage[],
  meta: DocumentMetadata,
): Document {
  const bodies: ChunkBody[] = [];
  for (const page of pages) {
    for (const body of packParagraphs(page.paragraphs.map((p) => p.text))) {
      bodies.push({
        text: `${buildPrefix(meta, page.page_number)}\n${body}`,
        page_number: page.page_number,
      });
    }
  }
  return { metadata: meta, bodies };
}

// Flattens a document into its stored chunk records: assigns each body its
// positional chunk_index and stamps on the document metadata.
export function documentToChunks(doc: Document): Chunk[] {
  return doc.bodies.map((body, chunk_index) => ({
    ...doc.metadata,
    text: body.text,
    chunk_index,
    page_number: body.page_number,
  }));
}

function splitLongParagraph(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let buf: string[] = [];
  let tokens = 0;
  for (const s of sentences) {
    const t = estimateTokens(s);
    if (tokens + t > TARGET_TOKENS && buf.length > 0) {
      out.push(buf.join(' '));
      buf = [s];
      tokens = t;
    } else {
      buf.push(s);
      tokens += t;
    }
  }
  if (buf.length > 0) out.push(buf.join(' '));
  return out;
}
