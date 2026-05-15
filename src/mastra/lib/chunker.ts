import { z } from 'zod';
import type { OrderedPage } from './column-sort';
import { germanFormatDate, type DocumentMetadata } from './metadata';

export const chunkSchema = z.object({
  text: z.string(),
  chunk_index: z.number().int().nonnegative(),
  page_number: z.number().int().positive(),
  source_type: z.enum(['newspaper', 'website']),
  published_at: z.string(),
  edition_no: z.number().nullable(),
  edition_title: z.string(),
  document_url: z.string(),
});

export type Chunk = z.infer<typeof chunkSchema>;

const TARGET_TOKENS = 600;
const HARD_CAP_TOKENS = 800;
const OVERLAP_TOKENS = 80;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function buildPrefix(meta: DocumentMetadata, page_number: number): string {
  return `[${meta.edition_title} | Ausgabe ${germanFormatDate(meta.published_at)} | Seite ${page_number}]`;
}

export function chunkDocument(
  pages: OrderedPage[],
  meta: DocumentMetadata,
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunk_index = 0;

  const push = (page: number, bodies: string[]) => {
    const prefix = buildPrefix(meta, page);
    const body = bodies.join('\n\n').trim();
    if (body.length === 0) return;
    chunks.push({
      text: `${prefix}\n${body}`,
      chunk_index,
      page_number: page,
      source_type: meta.source_type,
      published_at: meta.published_at,
      edition_no: meta.edition_no,
      edition_title: meta.edition_title,
      document_url: meta.document_url,
    });
    chunk_index += 1;
  };

  for (const page of pages) {
    let buf: string[] = [];
    let bufTokens = 0;

    const flush = () => {
      if (buf.length === 0) return;
      push(page.page_number, buf);
      const last = buf[buf.length - 1];
      const overlap = estimateTokens(last) <= OVERLAP_TOKENS ? [last] : [];
      buf = overlap;
      bufTokens = overlap.reduce((s, p) => s + estimateTokens(p), 0);
    };

    for (const para of page.paragraphs) {
      const paraTokens = estimateTokens(para.text);

      if (paraTokens > HARD_CAP_TOKENS) {
        flush();
        for (const slice of splitLongParagraph(para.text)) {
          push(page.page_number, [slice]);
        }
        continue;
      }

      if (bufTokens + paraTokens > HARD_CAP_TOKENS) flush();

      buf.push(para.text);
      bufTokens += paraTokens;

      if (bufTokens >= TARGET_TOKENS) flush();
    }
    if (buf.length > 0) push(page.page_number, buf);
  }

  return chunks;
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
