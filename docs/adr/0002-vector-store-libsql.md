# ADR 0002 — Vector store: LibSQL

**Status:** Accepted (for v1)
**Date:** 2026-05-14

## Context

The pipeline needs a vector store to hold chunk embeddings (1024-dim, see [ADR 0003](./0003-embedding-model-bge-m3.md)) along with the metadata used for re-ranking and citation — `source_type`, `published_at`, `edition_no`, `document_url`, `chunk_index`, `page_number`, `edition_title`, and the chunk `text`. Constraints:

- Must be self-hostable / EU-hostable. No US-cloud SaaS in the runtime path (see [ADR 0001](./0001-local-embeddings-for-dsgvo.md)).
- Must support vector similarity search **plus** SQL-style metadata filtering, because retrieval re-ranks on `published_at` and `source_type`.
- v1 corpus is small: a few hundred newspaper editions over a few years, plus a few thousand website pages → low five-digit chunk count. Performance is not the bottleneck.
- Mastra-native integration preferred; we already have `@mastra/libsql` and `@mastra/duckdb` in dependencies.

## Decision

Use **LibSQL** (via `@mastra/libsql`) as the vector store for v1.

- Single embedded SQLite-fork file with vector support (`vector32`, `vector_top_k`, `vector_distance_cos`).
- Lives on a mounted volume in the Docker Compose deployment shape — no extra service, no network hop.
- Mastra application state uses LibSQL by default. Observability storage is currently routed to DuckDB through `MastraCompositeStore`, so traces do not share the chunk vector database.

Migration path is left open: if recall, scale, or hybrid (dense + sparse) demands grow, move to **Qdrant** (Berlin-based, Apache-2.0, self-hostable in Docker, EU-defensible). Migration is mechanical: re-embed → upsert into Qdrant → swap the retrieval tool.

## Consequences

- **Zero infrastructure to add.** No DB container, no schema migrations beyond what Mastra and the vector index create.
- **Embedded storage.** Backups are file copies, though there are separate files for chunk vectors, Mastra state, and DuckDB observability.
- **Scale ceiling.** LibSQL's vector indexing is newer than Qdrant's/pgvector's. Expect to revisit if the corpus reaches hundreds of thousands of chunks or if recall quality on multilingual content shows weakness.
- **Hybrid search is not native.** bge-m3 can produce sparse vectors, but LibSQL only does dense. If we want hybrid retrieval, we'll either implement BM25 alongside in SQL or switch to Qdrant.
- **Coupling.** Storage choice is the only thing dictating chunk-row schema. Keep retrieval and storage behind a small interface so the swap stays cheap.

## Alternatives considered

- **DuckDB (`@mastra/duckdb`).** Also already a dep, also embedded, also EU-defensible. Strong on analytics, vector support via VSS extension. Rejected for v1 because LibSQL is what Mastra uses by default and the dual-engine setup is already in use (DuckDB handles observability storage); two engines is fine, three would be silly.
- **pgvector (Postgres).** Proven, robust, well-understood. Rejected for v1: adds a full Postgres container to Docker Compose for a corpus that doesn't need it. Reasonable v2 target if we need richer SQL.
- **Qdrant (self-hosted).** Best technical fit at scale. Berlin company, Apache-2.0, EU-defensible. Rejected for v1: the v1 corpus is small enough that the operational overhead of another container isn't justified. Documented as the migration target.
- **Chroma / LanceDB.** Both fine technically. Rejected: not first-class in Mastra, and LibSQL already covers v1 needs.
