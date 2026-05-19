import type { RerankedHit, SearchHit } from './search-types';

// The tunable knobs of the retrieval ranking stage, bundled in one place.
// See CONTEXT.md "Architecture commitments" for the rationale behind each.
export interface RetrievalPolicy {
  // Vector candidates fetched per requested hit, before reranking trims to topK.
  // A wider pool gives the recency/source rerank something to reorder.
  overFetchMultiplier: number;
  // Half-life in days for the exponential recency decay applied to published_at.
  halfLifeDays: number;
  // Per-source score multiplier; a source not listed here defaults to 1.0.
  sourceWeights: Record<string, number>;
}

export const DEFAULT_RETRIEVAL_POLICY: RetrievalPolicy = {
  overFetchMultiplier: 6,
  halfLifeDays: 60,
  sourceWeights: {
    newspaper: 1.5,
    website: 1.0,
  },
};

// Re-ranks raw vector hits by similarity × source_weight × recency_decay.
// `now` is injected separately from the policy — it is a clock seam for tests,
// not a tuning knob.
export function rerank(
  hits: SearchHit[],
  policy: RetrievalPolicy = DEFAULT_RETRIEVAL_POLICY,
  now: Date = new Date(),
): RerankedHit[] {
  const lambda = Math.LN2 / policy.halfLifeDays;

  const reranked = hits.map((hit) => {
    const weight = policy.sourceWeights[hit.metadata.source_type] ?? 1.0;
    const recency = recencyFactor(hit.metadata.published_at, now, lambda);
    return { ...hit, raw_score: hit.score, score: hit.score * weight * recency };
  });

  reranked.sort((a, b) => b.score - a.score);
  return reranked;
}

// A chunk with no publication date (the normal case for static website pages)
// does not decay — it keeps a recency factor of 1.0.
function recencyFactor(publishedAt: string | null, now: Date, lambda: number): number {
  if (!publishedAt) return 1.0;
  const days = Math.max(0, daysBetween(publishedAt, now));
  return Math.exp(-lambda * days);
}

function daysBetween(publishedAtIso: string, now: Date): number {
  const published = new Date(`${publishedAtIso}T00:00:00Z`);
  const ms = now.getTime() - published.getTime();
  return ms / (1000 * 60 * 60 * 24);
}
