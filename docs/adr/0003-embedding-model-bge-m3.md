# ADR 0003 — Embedding model: BAAI/bge-m3

**Status:** Accepted
**Date:** 2026-05-14

## Context

[ADR 0001](./0001-local-embeddings-for-dsgvo.md) requires local embeddings. We need to pick a specific open-weights model and run it via Ollama. Constraints:

- **German first.** All source content (newspaper, municipal website) is German; queries will be German. Model must handle Hochdeutsch and administrative jargon well.
- **Open weights, permissive license.** No SaaS dependency.
- **Reasonable footprint.** Has to run on a developer laptop and on a modest EU VPS, not a GPU cluster.
- **Stable dimensions.** Changing the embedding dimension forces a schema change in the vector store and a full re-embed. Pick once.
- **Future hybrid-search optionality.** Dense + sparse output is a plus, even if v1 only uses dense.

## Decision

Use **`BAAI/bge-m3`** as the embedding model, served by Ollama.

- 1024-dimensional dense vectors.
- Multilingual coverage including strong performance on German content.
- Produces dense, sparse (lexical), and multi-vector representations from the same forward pass — opens the door to hybrid retrieval later without changing models.
- Apache-2.0 licence.
- ~2.3 GB model file; runs on CPU at acceptable ingestion speed and well on a small GPU.
- Maintained by BAAI (Beijing Academy of AI) — research-respected, widely benchmarked.

Vector store schema (see [ADR 0002](./0002-vector-store-libsql.md)) is fixed at **1024 dim** based on this choice.

## Consequences

- **Storage cost:** 1024 × 4 bytes = 4 KB per chunk vector. Negligible at our corpus size; would matter at millions of chunks.
- **Embedding speed:** ~slower than smaller models (e.g. 384-dim MiniLM). Acceptable: ingestion is batch and offline; query embedding is one vector at a time.
- **Quality:** strong on multilingual benchmarks (MIRACL, MKQA) including German. Expect production-acceptable retrieval quality on Amtsblatt-style content.
- **Hybrid-search door open.** If retrieval quality on rare-word queries (proper nouns: street names, citizens' names mentioned in notices) is weak, we can add the sparse vector path without changing models.
- **Re-embedding is expensive once we have real data.** A model change after ingestion of years of editions means re-running the full pipeline. Switching cost grows over time → revisit *now* if there's any doubt, not later.

## Alternatives considered

- **`intfloat/multilingual-e5-large`.** 1024-dim, strong German, well-benchmarked. Close second. Rejected: bge-m3 wins on sparse + multi-vector optionality, and on more recent benchmarks. e5 is a defensible swap if bge-m3 disappoints.
- **`nomic-embed-text` / `nomic-embed-text-v1.5`.** Popular default in Ollama tutorials. Rejected: primarily English-trained; weaker German performance.
- **`jina-embeddings-v3`.** Strong multilingual, late-interaction support. Rejected for now: less mature Ollama integration; less community adoption. Reasonable future migration target.
- **`mxbai-embed-large` (mixedbread).** German team, EU-defensible provenance, good English performance. Rejected: weaker on German than bge-m3 in published benchmarks at decision time.
- **OpenAI `text-embedding-3-large`.** Best raw quality. Rejected by ADR 0001 (non-EU cloud).
