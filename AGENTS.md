# AGENTS.md

Operating instructions for this repo. For *what* this project is and *why*, read [`CONTEXT.md`](./CONTEXT.md) first.

## Before doing anything Mastra-related

Load the `mastra` skill. Mastra's APIs change frequently between versions; cached knowledge is unreliable.

## Commands

The full script list is in `package.json`. The ones with non-obvious behaviour:

```bash
pnpm run infra:dev       # Ollama + bge-m3 pull; required for `dev` AND integration tests
pnpm run crawl:website   # phase 1 — fetch the site into ./crawl-cache
pnpm run ingest:website  # phase 2 — extract/chunk/embed the cache, sweep orphans (needs phase 1 first)
pnpm test:integration    # real parse/embed/store/search; embedding tests skip if Ollama is down
```

`infra:dev` is the loop for editing source; `infra:up` mirrors the prod deploy (app container included).

## Conventions

- Register new agents/tools/workflows/scorers in `src/mastra/index.ts`.
- The website crawler in `src/crawler/` is a standalone module, not a Mastra workflow, and is deliberately not registered in `src/mastra/index.ts`. See [ADR 0005](./docs/adr/0005-website-crawler-standalone-module.md).
- Zod schemas for tool inputs and outputs.
- Keep vector store, embedding model, and LLM provider behind swappable interfaces (see [ADR 0002](./docs/adr/0002-vector-store-libsql.md), [ADR 0003](./docs/adr/0003-embedding-model-bge-m3.md), and CONTEXT.md).

## Hard rule

No ingestion, embedding, retrieval, or production answer path may send document or query text to a non-EU cloud provider. This comes from [ADR 0001](./docs/adr/0001-local-embeddings-for-dsgvo.md) and is non-negotiable.
