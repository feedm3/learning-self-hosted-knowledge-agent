# learning-self-hosted-knowledge-agent

A learning project: a self-hosted retrieval-augmented (RAG) agent built with [Mastra](https://mastra.ai/) that answers questions over two kinds of source: **biweekly newspaper PDFs** and a **publisher's website** (HTML plus PDFs linked from it). Replaces a managed setup of Ragie (PDF RAG) + Tavily (web search) with infrastructure I control.

Status: **work in progress, learning repo.** Not production-ready.

## Why self-host

Target deployment: **German municipalities** (Städte/Kommunen). The pipeline must be DSGVO-defensible — no document or query text leaves the EU in the runtime retrieval path. That rules out managed US-hosted RAG/search services and pushes embeddings to a local model. See [`CONTEXT.md`](./CONTEXT.md) for the full architectural picture and [`docs/adr/`](./docs/adr/) for the decisions behind it.

## Setup

Requires Node `>=22.13.0` and pnpm.

```shell
pnpm install
cp .env.example .env   # add OPENAI_API_KEY (dev only; LLM is swappable for prod)
```

Embeddings run locally via [Ollama](https://ollama.com/) — install it, then pull the model:

```shell
ollama pull bge-m3
```

Start the dev server:

```shell
pnpm run dev
```

Opens [Mastra Studio](http://localhost:4111) for interactive testing.

## Sample data

`docs/newspaper-samples/` contains two Amtsblatt editions from Kißlegg (a small town in southern Germany). These are **example data only** — the project is built to generalise to other municipalities with the same publication shape.

## Documentation layout

- [`CONTEXT.md`](./CONTEXT.md) — what this project is, the compliance constraint, architectural commitments, glossary. Read first.
- [`AGENTS.md`](./AGENTS.md) — operating rules for anyone (human or LLM) writing code here.
- [`docs/adr/`](./docs/adr/) — architectural decision records.
