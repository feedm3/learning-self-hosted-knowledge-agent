# CONTEXT.md

The shared mental model of this project. Read this before changing anything non-trivial.

## Purpose

Self-hosted RAG agent over biweekly newspaper PDFs, with a planned extension for a publisher's website (HTML + linked PDFs). Replaces a managed Ragie (PDF RAG) + Tavily (web search) setup with infrastructure we control. Built on Mastra.

Implemented today:

- PDF ingestion workflow: parse PDF text, order multi-column pages, chunk, embed, and upsert into LibSQL.
- Search workflow: embed the query locally and retrieve/rerank chunks from the combined chunk index.
- One answer agent: calls the search workflow and answers in German from retrieved chunks.

Not implemented yet:

- Website sitemap crawl / HTML ingestion.
- Website-linked PDF discovery.
- Production EU/self-hosted LLM configuration.

## Compliance constraint (non-negotiable)

Target deployment = **German municipalities** (Städte/Kommunen). The pipeline must be DSGVO-defensible. **No document or query text may flow to a non-EU cloud provider in the runtime retrieval path.**

- Embeddings: **local**, via Ollama. See [ADR 0001](./docs/adr/0001-local-embeddings-for-dsgvo.md).
- LLM: **swappable** provider. The checked-in dev default is OpenRouter (`openai/gpt-5-mini`), configured through `OPENROUTER_API_KEY`. Prod must use EU-hosted (Mistral La Plateforme, Aleph Alpha) or self-hosted (Llama/Mixtral via Ollama), and must not send real municipal document chunks or sensitive citizen queries to a non-EU provider.
- Observability: no Mastra `CloudExporter`, no US-cloud telemetry destinations.

## Architecture commitments

- **One agent, one combined vector index.** No per-source agents.
- Every chunk carries `{ text, source_type, published_at, edition_no, document_url, chunk_index, page_number, edition_title }`.
- For v1 `document_url` is the source filename; a real clickable URL is reconstructed downstream from filename + `published_at`.
- Retrieval = vector top-K → re-rank by `similarity × source_weight × recency_decay`.
  - `source_weight`: newspaper ≈ 1.5×, website ≈ 1×.
  - `recency_decay`: exponential, half-life ~60 days, applied to `published_at`.
- Intended retrieval once website ingestion exists: both source types queried on every retrieval (no cascade). Today the checked-in ingestion path only populates newspaper PDF chunks.
- Website ingestion is intended to be **pre-crawl** (sitemap-seeded), not live search. PDFs linked from the site should go through the same parse pipeline as the newspaper PDFs. This is not implemented yet.
- **Vector store v1: LibSQL** (single-file, embedded). See [ADR 0002](./docs/adr/0002-vector-store-libsql.md).
- **Embedding model: `BAAI/bge-m3`** via Ollama. See [ADR 0003](./docs/adr/0003-embedding-model-bge-m3.md).
- **PDF parser: pure-Node** (`unpdf` + custom column sort). See [ADR 0004](./docs/adr/0004-pdf-parser-pure-node.md).

## Glossary

- **newspaper** — the publication as a whole (biweekly).
- **edition** — a single biweekly release. Carries `edition_no` and `published_at`. Latest edition = most authoritative.
- **publisher website** — the companion HTML+PDF site for the newspaper.
- **source_type** — `"newspaper" | "website"`. Tags every chunk.
- **chunk** — one retrievable unit. Carries metadata for re-ranking.

## Example data ≠ domain

The sample editions in `docs/newspaper-samples/` are Kißlegg's municipal Amtsblatt, and the early target website is `kisslegg.de`. **Kißlegg is example data only.** The project is built to generalise to other German municipalities with the same publication shape — never hard-code Kißlegg-specific assumptions.

## Out of scope

- Live web search at query time.
- LLM with live web access (no `web_search` tool).
- Multi-tenant or per-user namespacing.
- Any non-EU cloud in the runtime retrieval path.

## Decisions (ADRs)

See [`docs/adr/`](./docs/adr/). Read these before changing the architecture. Current ADRs:

- [0001 — Local embeddings for DSGVO](./docs/adr/0001-local-embeddings-for-dsgvo.md)
- [0002 — Vector store: LibSQL](./docs/adr/0002-vector-store-libsql.md)
- [0003 — Embedding model: bge-m3](./docs/adr/0003-embedding-model-bge-m3.md)
- [0004 — PDF parser: pure-Node](./docs/adr/0004-pdf-parser-pure-node.md)
