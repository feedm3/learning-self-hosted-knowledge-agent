import type { RerankOptions, RerankedHit, SearchHit } from './search-types';

const DEFAULT_SOURCE_WEIGHTS: Record<string, number> = {
  newspaper: 1.5,
  website: 1.0,
};

const DEFAULT_HALF_LIFE_DAYS = 60;

export function rerank(hits: SearchHit[], opts: RerankOptions = {}): RerankedHit[] {
  const now = opts.now ?? new Date();
  const halfLife = opts.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const weights = opts.sourceWeights ?? DEFAULT_SOURCE_WEIGHTS;
  const lambda = Math.LN2 / halfLife;

  const reranked = hits.map((hit) => {
    const weight = weights[hit.metadata.source_type] ?? 1.0;
    const days = Math.max(0, daysBetween(hit.metadata.published_at, now));
    const recency = Math.exp(-lambda * days);
    return { ...hit, raw_score: hit.score, score: hit.score * weight * recency };
  });

  reranked.sort((a, b) => b.score - a.score);
  return reranked;
}

function daysBetween(publishedAtIso: string, now: Date): number {
  const published = new Date(`${publishedAtIso}T00:00:00Z`);
  const ms = now.getTime() - published.getTime();
  return ms / (1000 * 60 * 60 * 24);
}
