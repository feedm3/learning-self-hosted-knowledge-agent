import { describe, expect, it } from 'vitest';
import { rerank, DEFAULT_RETRIEVAL_POLICY } from './retrieval-policy';
import type { SearchHit } from './search-types';

function hit(
  id: string,
  score: number,
  source_type: string,
  published_at: string | null,
): SearchHit {
  return {
    id,
    score,
    text: `text ${id}`,
    metadata: {
      chunk_index: 0,
      page_number: 1,
      source_type: source_type as 'newspaper' | 'website',
      published_at,
      edition_no: null,
      document_title: 'Der Kißlegger',
      document_url: `${id}.pdf`,
    },
  };
}

const NOW = new Date('2026-05-16T00:00:00Z');

describe('rerank', () => {
  it('preserves the original score as raw_score', () => {
    const [result] = rerank(
      [hit('a', 0.8, 'newspaper', '2026-05-16')],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    expect(result.raw_score).toBe(0.8);
  });

  it('applies the source weight (newspaper 1.5x, website 1x)', () => {
    const [paper] = rerank(
      [hit('a', 1, 'newspaper', '2026-05-16')],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    const [web] = rerank(
      [hit('b', 1, 'website', '2026-05-16')],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    // same day -> recency factor ~1, so score is just the source weight
    expect(paper.score).toBeCloseTo(1.5, 5);
    expect(web.score).toBeCloseTo(1.0, 5);
  });

  it('defaults unknown source types to weight 1.0', () => {
    const [result] = rerank(
      [hit('a', 1, 'blog', '2026-05-16')],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    expect(result.score).toBeCloseTo(1.0, 5);
  });

  it('halves the recency factor after one half-life', () => {
    const oneHalfLifeAgo = '2026-03-17'; // 60 days before NOW
    const [result] = rerank(
      [hit('a', 1, 'website', oneHalfLifeAgo)],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    expect(result.score).toBeCloseTo(0.5, 2);
  });

  it('applies no decay when published_at is null', () => {
    const oldNow = new Date('2030-01-01T00:00:00Z');
    const [result] = rerank(
      [hit('a', 1, 'website', null)],
      DEFAULT_RETRIEVAL_POLICY,
      oldNow,
    );
    // no date -> recency factor 1.0, so score is just the source weight
    expect(result.score).toBeCloseTo(1.0, 5);
  });

  it('clamps future publication dates to a recency factor of 1', () => {
    const [result] = rerank(
      [hit('a', 1, 'website', '2026-12-31')],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    expect(result.score).toBeCloseTo(1.0, 5);
  });

  it('sorts hits by descending final score', () => {
    const result = rerank(
      [
        hit('old', 0.9, 'website', '2025-01-01'),
        hit('fresh', 0.6, 'newspaper', '2026-05-16'),
      ],
      DEFAULT_RETRIEVAL_POLICY,
      NOW,
    );
    expect(result.map((h) => h.id)).toEqual(['fresh', 'old']);
  });

  it('respects custom source weights from the policy', () => {
    const [result] = rerank(
      [hit('a', 1, 'website', '2026-05-16')],
      { ...DEFAULT_RETRIEVAL_POLICY, sourceWeights: { website: 3 } },
      NOW,
    );
    expect(result.score).toBeCloseTo(3, 5);
  });
});
