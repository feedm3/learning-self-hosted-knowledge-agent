import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parseDocumentMetadata, checkDateAgainstPageOne } from '../lib/metadata';
import { parsePdf } from '../lib/pdf-parser';
import { orderPage } from '../lib/column-sort';
import { chunkDocument, chunkSchema } from '../lib/chunker';
import { embedTexts } from '../lib/embedder';
import { replaceDocumentChunks } from '../lib/chunk-store';

const prepareChunks = createStep({
  id: 'prepare-chunks',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to a PDF matching DD-MM-YYYY-<slug>.pdf'),
  }),
  outputSchema: z.object({
    document_url: z.string(),
    chunks: z.array(chunkSchema),
    page_date_warning: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    const meta = parseDocumentMetadata(inputData.filePath);
    const parsed = await parsePdf(inputData.filePath);
    const orderedPages = parsed.pages.map(orderPage);

    let warning: string | null = null;
    const pageOne = orderedPages[0];
    if (pageOne) {
      const pageOneText = pageOne.paragraphs.map((p) => p.text).join('\n');
      const check = checkDateAgainstPageOne(meta.published_at, pageOneText);
      if (!check.ok) {
        warning = `Filename date ${meta.published_at} differs from page-1 date ${check.found}`;
      }
    }

    return {
      document_url: meta.document_url,
      chunks: chunkDocument(orderedPages, meta),
      page_date_warning: warning,
    };
  },
});

const embedAndStore = createStep({
  id: 'embed-and-store',
  inputSchema: z.object({
    document_url: z.string(),
    chunks: z.array(chunkSchema),
    page_date_warning: z.string().nullable(),
  }),
  outputSchema: z.object({
    document_url: z.string(),
    chunk_count: z.number(),
    page_date_warning: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    const { document_url, chunks, page_date_warning } = inputData;
    if (chunks.length === 0) {
      return { document_url, chunk_count: 0, page_date_warning };
    }
    const vectors = await embedTexts(chunks.map((c) => c.text));
    await replaceDocumentChunks(chunks, vectors);
    return { document_url, chunk_count: chunks.length, page_date_warning };
  },
});

export const ingestPdfWorkflow = createWorkflow({
  id: 'ingest-pdf',
  inputSchema: z.object({
    filePath: z.string(),
  }),
  outputSchema: z.object({
    document_url: z.string(),
    chunk_count: z.number(),
    page_date_warning: z.string().nullable(),
  }),
})
  .then(prepareChunks)
  .then(embedAndStore)
  .commit();
