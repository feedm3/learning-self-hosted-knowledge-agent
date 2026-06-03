// Retrieval eval — scores the search layer in isolation, bypassing the LLM.
// Mirrors what searchChunksWorkflow does (embed query, vector top-K, rerank)
// and measures whether the gold documents come back well-ranked. See ADR 0006.
//
// Needs Ollama running (`pnpm run infra:dev`) for query embeddings.

import { evalite } from 'evalite';
import { embedSingle } from '../src/mastra/lib/embedder';
import { searchTopK } from '../src/mastra/lib/chunk-store';
import { dataset, type GoldQuery } from './dataset';
import { recallAt, mrr, type RetrievalOutput } from './scorers';

// Wide enough to compute recall@20; the agent itself searches with topK 5.
const RETRIEVAL_TOP_K = 20;

evalite<GoldQuery, RetrievalOutput, GoldQuery>('Retrieval — search layer', {
  // Refusal queries have no gold documents; they belong to the generation eval.
  data: () =>
    dataset
      .filter((q) => !q.mustRefuse)
      .map((q) => ({ input: q, expected: q })),

  task: async (query) => {
    const queryVector = await embedSingle(query.query);
    const hits = await searchTopK(queryVector, RETRIEVAL_TOP_K);
    // Collapse chunk hits to documents, keeping first-seen rank order.
    const seen = new Set<string>();
    const rankedDocs: string[] = [];
    for (const hit of hits) {
      const url = hit.metadata.document_url;
      if (!seen.has(url)) {
        seen.add(url);
        rankedDocs.push(url);
      }
    }
    return rankedDocs;
  },

  scorers: [recallAt(5), recallAt(20), mrr],

  columns: ({ input, output, expected }) => [
    { label: 'category', value: input.category },
    { label: 'query', value: input.query },
    { label: 'expected docs', value: (expected?.relevantDocUrls ?? []).join('\n') },
    { label: 'retrieved top-5', value: output.slice(0, 5).join('\n') },
  ],
});
