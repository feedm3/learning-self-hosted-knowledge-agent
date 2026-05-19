import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parseDocumentMetadata } from '../lib/metadata';
import { documentSchema } from '../lib/chunker';
import { pdfFileToDocument } from '../lib/pdf-document';
import { indexDocument } from '../lib/document-index';

const prepareChunks = createStep({
  id: 'prepare-chunks',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to a PDF matching DD-MM-YYYY-<slug>.pdf'),
  }),
  outputSchema: z.object({
    document: documentSchema,
    page_date_warning: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    const meta = parseDocumentMetadata(inputData.filePath);
    return pdfFileToDocument(inputData.filePath, meta);
  },
});

const embedAndStore = createStep({
  id: 'embed-and-store',
  inputSchema: z.object({
    document: documentSchema,
    page_date_warning: z.string().nullable(),
  }),
  outputSchema: z.object({
    document_url: z.string(),
    chunk_count: z.number(),
    page_date_warning: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    const { document, page_date_warning } = inputData;
    await indexDocument(document);
    return {
      document_url: document.metadata.document_url,
      chunk_count: document.bodies.length,
      page_date_warning,
    };
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
