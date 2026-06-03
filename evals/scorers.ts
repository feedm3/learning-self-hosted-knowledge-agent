// Evalite scorers for the two eval layers. See ADR 0006.
//
// Retrieval scorers are fully deterministic — they compare ranked document_urls
// against the gold set. Generation scorers read fields off the judge result
// computed once in the task, plus one deterministic regex (citation format).

import { createScorer } from 'evalite';
import type { GoldQuery } from './dataset';
import type { JudgeResult } from './judge';

// --- retrieval layer ---

// Output of the retrieval task: document_urls in rank order, deduplicated.
export type RetrievalOutput = string[];

// recall@k — fraction of gold documents that appear in the top k results.
export const recallAt = (k: number) =>
  createScorer<GoldQuery, RetrievalOutput, GoldQuery>({
    name: `recall@${k}`,
    description: `Fraction of relevant documents found within the top ${k} results`,
    scorer: ({ output, expected }) => {
      const relevant = expected.relevantDocUrls;
      if (relevant.length === 0) return 1;
      const topK = new Set(output.slice(0, k));
      const found = relevant.filter((url) => topK.has(url)).length;
      return found / relevant.length;
    },
  });

// MRR — reciprocal rank of the first relevant document (1 = top, 0 = absent).
export const mrr = createScorer<GoldQuery, RetrievalOutput, GoldQuery>({
  name: 'MRR',
  description: 'Reciprocal rank of the first relevant document',
  scorer: ({ output, expected }) => {
    const relevant = new Set(expected.relevantDocUrls);
    if (relevant.size === 0) return 1;
    const rank = output.findIndex((url) => relevant.has(url));
    return rank === -1 ? 0 : 1 / (rank + 1);
  },
});

// --- generation layer ---

// Output of the generation task: the answer plus the precomputed judge result.
export interface GenerationOutput {
  answer: string;
  retrievedCount: number;
  judge: JudgeResult;
}

export const faithfulness = createScorer<GoldQuery, GenerationOutput, GoldQuery>({
  name: 'faithfulness',
  description: 'Fraction of answer claims grounded in the retrieved context',
  scorer: ({ output }) => ({
    score: output.judge.faithfulness,
    metadata: { reason: output.judge.reason },
  }),
});

export const completeness = createScorer<GoldQuery, GenerationOutput, GoldQuery>({
  name: 'completeness',
  description: 'Fraction of the expected facts present in the answer',
  scorer: ({ output, expected }) =>
    // Refusal queries have no expected facts — completeness does not apply.
    expected.mustRefuse ? 1 : output.judge.completeness,
});

export const germanOnly = createScorer<GoldQuery, GenerationOutput, GoldQuery>({
  name: 'german-only',
  description: 'Answer is written entirely in German',
  scorer: ({ output }) => (output.judge.language === 'de' ? 1 : 0),
});

export const refusalCorrect = createScorer<GoldQuery, GenerationOutput, GoldQuery>({
  name: 'refusal-correct',
  description: 'Answer refuses exactly when the query is out of corpus',
  scorer: ({ output, expected }) =>
    output.judge.refused === expected.mustRefuse ? 1 : 0,
});

// Matches a citation prefix line: either the website form `[Titel › Abschnitt –
// https://…]` or the newspaper form `[Der … | Ausgabe … | Seite N]`.
const CITATION_RE = /\[[^\]]*(?:– https?:\/\/|\| Seite \d|\| Ausgabe )[^\]]*\]/;

export const citationFormat = createScorer<GoldQuery, GenerationOutput, GoldQuery>({
  name: 'citation-format',
  description: 'Answer carries a source citation in the expected bracketed format',
  scorer: ({ output, expected }) =>
    // A correct refusal cites nothing, so the citation rule does not apply.
    expected.mustRefuse ? 1 : CITATION_RE.test(output.answer) ? 1 : 0,
});
