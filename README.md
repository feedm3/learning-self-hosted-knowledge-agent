# learning-self-hosted-knowledge-agent

A learning project: a self-hosted retrieval-augmented (RAG) agent built with [Mastra](https://mastra.ai/) that answers questions over biweekly newspaper PDFs and a publisher's website (HTML plus PDFs linked from it). It replaces a managed setup of Ragie (PDF RAG) + Tavily (web search) with infrastructure I control.

Status: **work in progress, learning repo.** Not production-ready. The implemented path today is PDF ingestion, a two-phase website crawler, combined search, and a Mastra answer agent. Crawl scheduling and a production EU/self-hosted LLM are still open.

## Why self-host

Target deployment: **German municipalities** (Städte/Kommunen). The pipeline must be DSGVO-defensible — no document or query text leaves the EU in the runtime retrieval path. That rules out managed US-hosted RAG/search services and pushes embeddings to a local model. See [`CONTEXT.md`](./CONTEXT.md) for the full architectural picture and [`docs/adr/`](./docs/adr/) for the decisions behind it.

## Setup

Requires Node `>=22.13.0`, pnpm, and a Docker engine (Docker Desktop, [OrbStack](https://orbstack.dev/), Colima, or `docker.io` on Linux).

```shell
pnpm install
cp .env.example .env   # add OPENROUTER_API_KEY for dev answer generation
```

Embeddings run locally via [Ollama](https://ollama.com/) and the `BAAI/bge-m3` model. Both run in containers defined in [`compose.yaml`](./compose.yaml) — no manual install needed.

The answer agent currently uses OpenRouter by default (`openai/gpt-5-mini`) for development only. Do not run that cloud LLM path with production municipal data or sensitive citizen queries; the LLM provider is intentionally swappable before production.

### Day-to-day dev (edit code on the host, hot-reload)

```shell
pnpm run infra:dev    # starts Ollama, pulls bge-m3 on first run
pnpm run dev          # Mastra Studio on http://localhost:4111
```

### Full stack (matches the server deploy shape)

```shell
pnpm run infra:up     # builds the app image, starts Ollama + app
pnpm run infra:logs   # tail logs
pnpm run infra:down   # stop everything (named volumes persist)
```

App is reachable on `http://localhost:4111`. State (`chunks.db`, `mastra.db`, model cache) is persisted in named volumes; `docker compose down -v` wipes them.

### Ingesting the publisher website

The website crawler runs as two phases (it needs `infra:dev` up for embeddings):

```shell
pnpm run crawl:website    # phase 1 — fetch the site into ./crawl-cache
pnpm run ingest:website   # phase 2 — extract, chunk, embed, sweep orphans
```

`crawl:website` writes a gitignored snapshot to `crawl-cache/`; `ingest:website` reads it, so a failed ingest can be retried without re-fetching. See [ADR 0005](./docs/adr/0005-website-crawler-standalone-module.md).

## Sample data

`docs/newspaper-samples/` contains two Amtsblatt editions from Kißlegg (a small town in southern Germany). These are **example data only** — the project is built to generalise to other municipalities with the same publication shape.

## Documentation layout

- [`CONTEXT.md`](./CONTEXT.md) — what this project is, the compliance constraint, architectural commitments, glossary. Read first.
- [`AGENTS.md`](./AGENTS.md) — operating rules for anyone (human or LLM) writing code here.
- [`docs/adr/`](./docs/adr/) — architectural decision records.
