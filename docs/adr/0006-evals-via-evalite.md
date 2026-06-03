# ADR 0006 — Evals run on Evalite, split into a retrieval eval and a generation eval

**Status:** Accepted
**Date:** 2026-05-19

## Context

The retrieval policy (`source_weight`, `recency_decay`, over-fetch, topK, chunk
size) is explicitly tunable, and the answer agent's LLM is intentionally swappable
before production (dev OpenRouter → an EU/self-hosted prod model). Both need a
measurement harness: tuning without metrics is guesswork, and the LLM swap needs a
regression net. There was no eval suite — `scorers: {}` in `src/mastra/index.ts`
is empty.

The pure rerank math (`retrieval-policy.ts`) is already covered by deterministic
unit tests. Evals are aimed only at what unit tests cannot reach: embedding/vector
recall, and LLM answer quality.

## Decision

Two eval layers, isolated so a failure points at one subsystem:

- **Retrieval eval** — calls the search workflow directly, bypassing the LLM.
  Deterministic metrics against gold `document_url`s, no judge: recall@5 (the
  agent's operating point — it searches with `topK: 5`), recall@20 (retrievability
  headroom — a chunk found at 20 but not 5 is a ranking problem, not a findability
  problem), and MRR. Relevance is document-level (`document_url`) for v1, not
  chunk-level.
- **Generation eval** — runs the full answer agent. Scores faithfulness,
  completeness, citation-format, German-only, refusal correctness. The agent is
  obtained via `mastra.getAgent('answerAgent')`, not imported bare — its `Memory`
  needs the storage provider wired on the Mastra instance, or `generate()` throws
  "Memory requires a storage provider".

**Gold label = `document_url`s + fact checklist.** Each query carries the
`document_url`s that should be retrieved, the facts the answer must contain, and a
`must_refuse` flag — not a hand-written reference answer (too brittle; many
phrasings are correct).

**Query set:** ~40–50 queries across four categories (single-chunk factual,
multi-chunk synthesis, out-of-corpus/refusal, source-routing & recency),
LLM-drafted from corpus chunks then human-reviewed. Built offline from Kißlegg
*example* data, so it is not the runtime retrieval path and the DSGVO constraint
(ADR 0001) does not apply to authoring or judging.

**Judge:** Gemini 3.1 Flash Lite via OpenRouter, distinct from the answer agent's
model (`gpt-5-mini`) to avoid self-grading bias. Offline-only. A cheap fast model
is acceptable because the judge tasks are narrow and structured (does each
expected fact appear; is any claim ungrounded) rather than open-ended grading.

**Harness: Evalite.** `.eval.ts` files run by the `evalite` CLI (`pnpm run eval`),
on demand — no CI gate (LLM-judge scoring is non-deterministic and costs API
calls; gating would mean flaky red builds). The query set lives in a plain
TypeScript module (`evals/dataset.ts`) imported by both `.eval.ts` files —
not a separate JSON file, and not duplicated inline across the two evals.

## Considered options

- **Mastra scorers** (`scorers: {}`). Rejected as the primary harness: scorers
  attach to an agent and score live/sampled production traces — quality
  *monitoring*, not a batch run over a fixed dataset for tuning. They remain the
  right tool for production monitoring later; this ADR does not preclude adding
  them then.
- **`@mastra/evals` / Mastra's dataset eval support.** Reasonable, but Evalite
  gives a local watch-mode report UI, run-over-run comparison, and a `.eval.ts`
  glob cleanly separated from the `.test.ts` unit suite. `@mastra/evals` was
  removed from `package.json` once Evalite was chosen. Revisit if Evalite
  (v1 beta) proves unstable.
- **Vitest eval files in `test/`.** Rejected: non-deterministic LLM-judge scoring
  makes flaky tests and pollutes the unit suite. Evalite is Vitest-based but runs
  under its own CLI and glob, which avoids exactly this.
- **Hand-rolled `scripts/eval.ts` + report.** Rejected: Evalite provides the
  runner, UI, and historical comparison for free.
- **Full reference answers as gold labels.** Rejected: brittle, and scoring them
  needs fuzzy similarity. The fact-checklist is cheaper and more robust.

## Consequences

- Evalite v1 is in beta — the harness layer carries some churn risk. The durable
  asset is the labeled query set, which is tool-independent and survives a harness
  swap.
- No CI gate means regressions are caught only when `pnpm run eval` is run by hand
  — acceptable while the project is pre-production; revisit when an EU prod LLM is
  wired up.
- End-to-end source-routing/recency queries are best-effort: only two newspaper
  editions exist, ~2 weeks apart, so the recency signal is weak and partly
  redundant with the rerank unit tests.
