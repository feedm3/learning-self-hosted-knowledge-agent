# CONTEXT.md

The shared mental model of this project. Read this before changing anything non-trivial.

## Purpose

Self-hosted RAG agent over biweekly newspaper PDFs, with a planned extension for a publisher's website (HTML + linked PDFs). Replaces a managed Ragie (PDF RAG) + Tavily (web search) setup with infrastructure we control. Built on Mastra.

Implemented today:

- PDF ingestion workflow: parse PDF text, order multi-column pages, chunk, embed, and upsert into LibSQL.
- Website crawler: two-phase pipeline — `crawl:website` fetches the publisher site into a gitignored crawl cache, `ingest:website` extracts/chunks/embeds the cache into the index and sweeps disappeared pages. Standalone module.
- Search workflow: embed the query locally and retrieve/rerank chunks from the combined chunk index.
- One answer agent: calls the search workflow and answers in German from retrieved chunks.

Not implemented yet:

- Crawl scheduling (periodic re-crawls are triggered manually for now).
- Production EU/self-hosted LLM configuration.

## Compliance constraint (non-negotiable)

Target deployment = **German municipalities** (Städte/Kommunen). The pipeline must be DSGVO-defensible. **No document or query text may flow to a non-EU cloud provider in the runtime retrieval path.**

- Embeddings: **local**, via Ollama. See [ADR 0001](./docs/adr/0001-local-embeddings-for-dsgvo.md).
- LLM: **swappable** provider. The checked-in dev default is OpenRouter (`openai/gpt-5-mini`), configured through `OPENROUTER_API_KEY`. Prod must use EU-hosted (Mistral La Plateforme, Aleph Alpha) or self-hosted (Llama/Mixtral via Ollama), and must not send real municipal document chunks or sensitive citizen queries to a non-EU provider.
- Observability: no Mastra `CloudExporter`, no US-cloud telemetry destinations.

## Architecture commitments

- **One agent, one combined vector index.** No per-source agents.
- Every chunk carries `{ text, source_type, published_at, edition_no, document_url, chunk_index, page_number, document_title }`. `published_at`, `edition_no` and `page_number` are nullable — website pages have no page number, dateless content has no `published_at`.
- For newspaper editions `document_url` is the source filename; a real clickable URL is reconstructed downstream from filename + `published_at`. For website documents `document_url` is the real page/file URL.
- Retrieval = vector top-K → re-rank by `similarity × source_weight × recency_decay`.
  - `source_weight`: newspaper ≈ 1.5×, website ≈ 1×.
  - `recency_decay`: exponential, half-life ~60 days, applied to `published_at`. A chunk with no `published_at` gets recency factor 1.0 (no decay) — this is the normal case for static website pages.
- Retrieval queries both source types on every retrieval (no cascade); the combined index holds newspaper PDF chunks and website chunks together.
- Website ingestion is **pre-crawl** (a periodic full crawl), not live search. The crawler discovers pages by link-following from seed URLs, bounded to `kisslegg.de`; a TYPO3 sitemap is used as a best-effort seed if reachable but is not relied on. Each crawl is a full re-crawl followed by an orphan sweep (chunks of pages confirmed gone — HTTP 404/410 — are deleted). Non-Amtsblatt PDFs linked from the site are ingested as `source_type="website"`; Amtsblatt PDFs are skipped (the newspaper is ingested via its own PDF flow). A linked PDF counts as an Amtsblatt edition when its URL contains the newspaper's name — derived from the newspaper `document_title` (not hard-coded), matched on a normalised URL (percent-decoded, case-folded, `_`/`-` treated as spaces). Example skipped URL: `…/Der_Kißlegger/Kißlegger_09.05.2026.pdf`.
- The crawl runs as **two phases** over an on-disk crawl cache (gitignored). `crawl:website` fetches every reachable page into `crawl-cache/` — raw HTML and PDF bytes mirrored as a directory tree, plus a `manifest.json` source-of-truth — built in a temp directory and atomically swapped into place only on success. `ingest:website` reads that cache (extract → chunk → embed → store) and then runs the orphan sweep from the manifest's confirmed-gone set. The split lets a failed ingest (e.g. an embedding error) restart without re-fetching, and lets the crawled pages be inspected by hand. See [ADR 0005](./docs/adr/0005-website-crawler-standalone-module.md).
- **Vector store v1: LibSQL** (single-file, embedded). See [ADR 0002](./docs/adr/0002-vector-store-libsql.md).
- **Embedding model: `BAAI/bge-m3`** via Ollama. See [ADR 0003](./docs/adr/0003-embedding-model-bge-m3.md).
- **PDF parser: pure-Node** (`unpdf` + custom column sort). See [ADR 0004](./docs/adr/0004-pdf-parser-pure-node.md).

## Glossary

- **newspaper** — the publication as a whole (biweekly).
- **edition** — a single biweekly release of the newspaper. Carries `edition_no` and `published_at`. Latest edition = most authoritative. Newspaper-only concept; website documents are not editions.
- **publisher website** — the companion HTML+PDF site for the newspaper.
- **document** — one ingested source unit, identified by `document_url`: a newspaper edition (PDF), a website page (HTML), or a website-linked PDF.
- **document_title** — human label for a document: `"Der Kißlegger"` for newspaper editions, the page `<title>` for website pages, the anchor link text for website-linked PDFs.
- **crawl** — one full pass over the publisher website, run in two phases: the *crawl* phase fetches every reachable page into the crawl cache; the *ingest* phase extracts, chunks, embeds and stores them, then sweeps pages that have disappeared.
- **crawl cache** — a gitignored on-disk snapshot of the most recent crawl: raw HTML and PDF bytes mirrored as a directory tree, plus a manifest. Lets the ingest phase re-run without re-fetching, and lets a human inspect what was crawled.
- **editorial date** — a website page's `article:modified_time` (fallback `article:published_time`). Used as `published_at` for website chunks. Absent ⇒ the chunk has no `published_at` and does not decay.
- **source_type** — `"newspaper" | "website"`. Tags every chunk.
- **chunk** — one retrievable unit. Carries metadata for re-ranking.
- **indexing** — embedding a document's chunks locally and upserting them into the combined chunk index, replacing any earlier chunks of the same document. The shared tail of every ingestion path (newspaper PDF, website HTML, website PDF).
- **retrieval policy** — the tunable knobs of the retrieval ranking stage, bundled in one place: vector over-fetch multiplier, per-source weights, and recency half-life.

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
- [0005 — Website crawler: standalone module](./docs/adr/0005-website-crawler-standalone-module.md)
