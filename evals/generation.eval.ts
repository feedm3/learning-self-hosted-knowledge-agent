// Generation eval — scores the full answer agent: faithfulness, completeness,
// German-only, refusal correctness, and citation format. See ADR 0006.
//
// Needs Ollama (`pnpm run infra:dev`) for the agent's query embeddings and
// OPENROUTER_API_KEY for both the answer agent and the LLM judge.

import { evalite } from 'evalite';
// Pull the agent from the configured Mastra instance, not the bare module —
// the agent's Memory needs the storage provider wired on the instance, or
// generate() fails with "Memory requires a storage provider".
import { mastra } from '../src/mastra/index';
import { embedSingle } from '../src/mastra/lib/embedder';
import { searchTopK } from '../src/mastra/lib/chunk-store';
import { dataset, type GoldQuery } from './dataset';
import { judgeAnswer } from './judge';
import {
  faithfulness,
  completeness,
  germanOnly,
  refusalCorrect,
  citationFormat,
  type GenerationOutput,
} from './scorers';

// Context the judge checks faithfulness against. Re-running the search here —
// rather than parsing the agent's tool-call results — keeps the judge context
// deterministic. Slightly wider than the agent's topK 5 to avoid false
// hallucination flags when a claim sits in a slightly lower-ranked chunk.
const JUDGE_CONTEXT_TOP_K = 10;

evalite<GoldQuery, GenerationOutput, GoldQuery>('Generation — answer agent', {
  data: () => dataset.map((q) => ({ input: q, expected: q })),

  task: async (query) => {
    const answerAgent = mastra.getAgent('answerAgent');
    // Isolate each case in its own memory thread. The agent has Memory
    // (lastMessages: 20); without a per-case thread, answers from earlier
    // queries would leak into later ones' context — a refusal query run after
    // several Kißlegg answers could be answered from carried-over history.
    // Each eval query is independent, so give it a fresh, stable thread.
    const result = await answerAgent.generate(query.query, {
      memory: { thread: `eval-${query.id}`, resource: 'eval-generation' },
    });
    const answer = result.text ?? '';

    const queryVector = await embedSingle(query.query);
    const contextHits = await searchTopK(queryVector, JUDGE_CONTEXT_TOP_K);
    const contextChunks = contextHits.map((hit) => hit.text);

    const judge = await judgeAnswer({
      query: query.query,
      answer,
      contextChunks,
      expectedFacts: query.expectedFacts,
      mustRefuse: query.mustRefuse,
    });

    return { answer, retrievedCount: contextChunks.length, judge };
  },

  scorers: [faithfulness, completeness, germanOnly, refusalCorrect, citationFormat],

  columns: ({ input, output }) => [
    { label: 'category', value: input.category },
    { label: 'query', value: input.query },
    { label: 'answer', value: output.answer },
    { label: 'judge reason', value: output.judge.reason },
  ],
});
