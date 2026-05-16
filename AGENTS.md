# AGENTS.md

Operating instructions for this repo. For *what* this project is and *why*, read [`CONTEXT.md`](./CONTEXT.md) first.

## Before doing anything Mastra-related

Load the `mastra` skill. Mastra's APIs change frequently between versions; cached knowledge is unreliable.

## Commands

```bash
pnpm run infra:dev    # Ollama + bge-m3 pull (one-time); needed for dev and integration tests
pnpm run dev          # Mastra Studio at localhost:4111
pnpm run build        # Mastra production build
pnpm run typecheck    # tsc over src/ and test/
pnpm test             # unit suite — pure logic, no infra
pnpm test:integration # real PDF parse/embed/store/search; embedding tests skip if Ollama is down
pnpm run infra:up     # full stack incl. app container (mirrors the server deploy)
pnpm run infra:down   # stop everything; named volumes persist
```

`infra:dev` is the loop for editing source; `infra:up` mirrors the prod deploy. See [`compose.yaml`](./compose.yaml) for the services.

## Conventions

- Register new agents/tools/workflows/scorers in `src/mastra/index.ts`.
- Zod schemas for tool inputs and outputs.
- Keep vector store, embedding model, and LLM provider behind swappable interfaces (see [ADR 0002](./docs/adr/0002-vector-store-libsql.md), [ADR 0003](./docs/adr/0003-embedding-model-bge-m3.md), and CONTEXT.md).

## Hard rule

No ingestion, embedding, retrieval, or production answer path may send document or query text to a non-EU cloud provider. This comes from [ADR 0001](./docs/adr/0001-local-embeddings-for-dsgvo.md) and is non-negotiable.

## Resources

- [Mastra documentation](https://mastra.ai/llms.txt)
- [Mastra .well-known skills discovery](https://mastra.ai/.well-known/skills/index.json)
