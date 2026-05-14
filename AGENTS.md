# AGENTS.md

Operating instructions for this repo. For *what* this project is and *why*, read [`CONTEXT.md`](./CONTEXT.md) first.

## Before doing anything Mastra-related

Load the `mastra` skill. Mastra's APIs change frequently between versions; cached knowledge is unreliable.

## Commands

```bash
pnpm run dev    # Mastra Studio at localhost:4111 (long-running)
pnpm run build  # use to verify changes compile
```

## Conventions

- Register new agents/tools/workflows/scorers in `src/mastra/index.ts`.
- Zod schemas for tool inputs and outputs.
- Keep vector store, embedding model, and LLM provider behind swappable interfaces (see [ADR 0002](./docs/adr/0002-vector-store-libsql.md), [ADR 0003](./docs/adr/0003-embedding-model-bge-m3.md), and CONTEXT.md).

## Hard rule

No code path may send document or query text to a non-EU cloud provider. This comes from [ADR 0001](./docs/adr/0001-local-embeddings-for-dsgvo.md) and is non-negotiable.

## Resources

- [Mastra documentation](https://mastra.ai/llms.txt)
- [Mastra .well-known skills discovery](https://mastra.ai/.well-known/skills/index.json)
