// Runs the real answer agent over the gold dataset and dumps each case —
// answer + the context the agent ACTUALLY retrieved + the gold labels — to a
// JSON file, WITHOUT invoking the LLM judge. Lets a human (or a different,
// stronger model) grade the answers offline instead of the OpenRouter judge.
//
// Run against the isolated eval DB, same as `pnpm run eval`:
//   CHUNKS_DB_URL="file://$PWD/data/eval-chunks.db" DUMP_OUT=/path/cases.json \
//     pnpm exec tsx scripts/dump-eval-cases.ts
// Needs Ollama (`pnpm run infra:dev`) for query embeddings and a valid
// OPENROUTER_API_KEY for the answer agent.

import { writeFileSync } from 'node:fs';
import { mastra } from '../src/mastra/index';
import { dataset } from '../evals/dataset';
import { retrievedContext } from '../evals/retrieved-context';

const OUT = process.env.DUMP_OUT ?? 'eval-cases.json';

interface DumpedCase {
  id: string;
  category: string;
  query: string;
  answer: string;
  contextChunks: string[];
  expectedFacts: string[];
  mustRefuse: boolean;
  relevantDocUrls: string[];
}

async function main(): Promise<void> {
  const agent = mastra.getAgent('answerAgent');
  const cases: DumpedCase[] = [];

  for (const q of dataset) {
    // Fresh per-case memory thread so earlier answers don't leak into later
    // queries' context (mirrors generation.eval.ts).
    const result = await agent.generate(q.query, {
      memory: { thread: `eval-${q.id}`, resource: 'eval-generation' },
    });
    const answer = result.text ?? '';
    const contextChunks = retrievedContext(
      (result as { toolResults?: unknown }).toolResults,
    );
    cases.push({
      id: q.id,
      category: q.category,
      query: q.query,
      answer,
      contextChunks,
      expectedFacts: q.expectedFacts,
      mustRefuse: q.mustRefuse,
      relevantDocUrls: q.relevantDocUrls,
    });
    console.log(
      `[${cases.length}/${dataset.length}] ${q.id} — ${contextChunks.length} chunks, ${answer.length} chars`,
    );
  }

  writeFileSync(OUT, JSON.stringify(cases, null, 2));
  console.log(`\nWrote ${cases.length} cases to ${OUT}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
