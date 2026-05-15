import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { embedSingle } from '../lib/embedder';
import { searchTopK, hitSchema } from '../lib/chunk-store';

const search = createStep({
  id: 'search',
  inputSchema: z.object({
    query: z.string().describe('Natural-language query to embed and search'),
    topK: z.number().int().positive().default(5),
  }),
  outputSchema: z.object({
    hits: z.array(hitSchema),
  }),
  execute: async ({ inputData }) => {
    const queryVector = await embedSingle(inputData.query);
    const hits = await searchTopK(queryVector, inputData.topK);
    return { hits };
  },
});

export const searchChunksWorkflow = createWorkflow({
  id: 'search-chunks',
  inputSchema: z.object({
    query: z.string(),
    topK: z.number().int().positive().default(5),
  }),
  outputSchema: z.object({
    hits: z.array(hitSchema),
  }),
})
  .then(search)
  .commit();
