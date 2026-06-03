# Project backlog

Working backlog for the project — currently focused on the eval harness and the
answer agent. See [ADR 0006](./docs/adr/0006-evals-via-evalite.md) for the eval
design and [`CONTEXT.md`](./CONTEXT.md) for the glossary. Run the evals with
`pnpm run eval` (needs `pnpm run infra:dev` for Ollama; `OPENROUTER_API_KEY` for
the generation eval).

## Baseline (last measured)

Retrieval (combined index — website + 3 newspaper editions):

| category               | recall@5 | recall@20 | MRR |
| ---------------------- | -------- | --------- | --- |
| single-chunk-factual   | 67%      | 80%       | 39% |
| multi-chunk-synthesis  | 67%      | 79%       | 31% |
| source-routing-recency | 100%     | 100%      | 64% |

Generation (40 queries, website-only index — **re-run after newspaper ingest**):
faithfulness 100% · completeness 93% · german-only 100% · refusal-correct 98%
· citation-format 100%.

> ⚠️ The generation numbers above predate the newspaper ingest. Re-run the
> generation eval to refresh them.

## Done

- [x] Two-layer Evalite harness (retrieval + generation), scorers, judge.
- [x] 44-query dataset, LLM-drafted + reviewed (single-chunk, multi-chunk,
      refusal, source-routing/recency).
- [x] `mastra.getAgent()` fix (Memory needs the instance's storage provider).
- [x] Removed the contradictory "Fläche" query (kisslegg.de lists both
      92.400 ha and 9.240 ha — no single correct gold).
- [x] `scripts/ingest-pdf.ts` + `pnpm run ingest:pdf` — all 3 editions ingested.
- [x] Source-routing/recency category added and validated (recall@5 100%).

## P0 — finish coverage

- [ ] **Finish the label review.** First run flagged 1 bad label in 40; the
      rest are unverified. Focus on multi-chunk queries where several pages are
      legitimately relevant but gold lists only one (e.g. "Ortschaften" — the
      `geschichte` and `in-zahlen` pages also answer it). Strict single-doc gold
      understates recall.

## P1 — make the eval reproducible (it currently isn't)

The evals are **not hermetic**: they run the real `answerAgent` against whatever
is in the local `data/chunks.db` (`CHUNKS_DB_URL ?? dataFileUrl('chunks.db')`) —
the same DB `mastra dev` uses — plus local Ollama and live OpenRouter. The gold
labels were authored against one website snapshot, but that snapshot is not
committed.

- [ ] **Commit a frozen eval crawl-cache subset.** `crawl-cache/` is gitignored,
      so a fresh checkout has no website data — `pnpm run crawl:website` does a
      *live* re-fetch of kisslegg.de, which drifts from the gold labels (pages
      move → recall 0; content edits → completeness drops; new pages → a refusal
      query stops being out-of-corpus). The cache is just raw HTML/PDF bytes + a
      manifest; commit the ~25 pages the eval references so `ingest:website` is
      reproducible. (Newspaper PDFs are already committed, so the source-routing
      queries are stable — only the website queries drift.)
- [ ] **Isolate the eval database.** Even with committed data, the eval reads the
      shared dev `chunks.db`, so prior experiments/ingests pollute it. Point the
      evals at a dedicated `eval-chunks.db` (set `CHUNKS_DB_URL`) built only from
      the frozen fixture, so eval state can't be contaminated by dev activity.
- [ ] **Choose the frozen subset = deterministic core + agentic curation.** The
      *minimal* covering set is AI-free: the gold labels already list every
      `relevantDocUrl`, so the subset is `union(all relevantDocUrls)` plus a
      handful of distractor pages — a small script. Use a Claude Code **Dynamic
      Workflow** (multi-agent fan-out) only for the judgment half: audit which
      query *kinds* are under-represented, and pick **hard-negative** pages
      (plausible-but-wrong, e.g. the Impressum / long PDFs that already crowd
      top-5) so the frozen corpus still stresses retrieval. NOT a job for the
      web "deep research" feature — that synthesises external web sources and
      cannot read local `chunks.db` or compute a covering subset.
- [ ] **Stamp the corpus version.** Until the above land, record "website gold
      labels verified against the crawl of <date>" so drift is visible.

## P1 — fix the measuring instrument (so scores are trustworthy)

- [ ] **Validate the judge itself.** Spot-check ~10 Gemini-flash-lite verdicts
      against a human read. The judge is the instrument; if it is lenient the
      93% completeness is suspect.
- [ ] **Judge against what the agent actually retrieved**, not a fresh
      `searchTopK(10)` in `generation.eval.ts`. Today faithfulness is scored
      against different context than the agent saw — a real hallucination could
      slip through. Parse the agent's tool-call results instead.
- [ ] **Sharpen the refusal criterion** (the Reisepass-Hamburg case). Decide
      whether "no Hamburg info, but here is Kißlegg's process" passes, then make
      the agent instructions and the judge/label agree.
- [ ] **Add `trialCount > 1`** on the generation eval — LLM output and LLM judge
      are both non-deterministic; single-trial scores wobble run-to-run.

## P2 — improve the agent's actual scores (the real work)

- [ ] **Tune cross-source ranking — now the top finding.** Ingesting the
      newspaper *dropped* website recall (single-chunk 80%→67%, MRR 58%→39%):
      the 1.5× newspaper `source_weight` crowds out correct website pages for
      website-answerable queries. Re-tune `source_weight` (and re-measure) so
      the newspaper boost does not starve the website.
- [ ] **Recency over-weights the newest edition.** For older-edition-specific
      topics (sr-02 Glascontainer, sr-05 Spendenaktion) the newest edition still
      ranks #1. Revisit the recency half-life / decay so an older edition that
      actually holds the answer can win.
- [ ] **Boilerplate dominates retrieval (MRR ~35%).** Short nav pages lose top-5
      slots to long PDFs (Hauptsatzung, Energie-Bilanz) and the keyword-dense
      Impressum. Strip boilerplate (Impressum/footer) at ingest and/or
      length-normalise so a 200-chunk PDF does not dominate a 2-chunk page.
- [ ] **Raise the agent's `topK` or fix rerank.** recall@20 ≫ recall@5, so
      relevant docs are findable but mis-ranked; the agent searches at topK 5 and
      never sees them.
- [ ] **Prompt tweak for synthesis** (the Kinderbetreuung hedge — the list was
      in context but the agent did not use it). Instruct it to synthesise lists
      from retrieved chunks rather than demand one canonical source.

## P3 — hardening / hygiene

- [ ] **Local judge for real-data evals.** Gemini is US-cloud — fine for Kißlegg
      example data (offline, not the runtime path) but a DSGVO issue on real
      municipal data. Document/enforce the boundary.
- [ ] **Report traces / token usage to the Evalite UI** so judge cost per run is
      visible (the raw-`fetch` judge is not AI-SDK-cached; watch mode re-bills).
- [ ] **Populate `edition_no`** if any "latest edition is authoritative" logic
      ever keys on it rather than `published_at` (currently always `null`).

## P3 — code-review cleanups (from the review, not yet applied)

- [ ] **Evals re-implement `searchChunksWorkflow`'s embed→search step inline**
      (in both eval files). If a query-rewrite step or a required `searchTopK`
      arg is added, the workflow changes but the evals silently measure the old
      pipeline. Consider running `searchChunksWorkflow` with a wider topK and
      reading `result.hits` instead.
- [ ] **`SITE` constant duplicates the crawler host** (`src/crawler/site-config.ts`
      `allowedHost: 'www.kisslegg.de'`). Pointing at another municipality changes
      the host in one place but the gold labels keep the stale prefix → all
      website scores silently drop to 0. Derive `SITE` from site-config.
- [ ] **`judge.ts` hand-rolls an OpenRouter `fetch`** (own URL default, auth,
      parsing) that duplicates `ModelRouterLanguageModel` already used by the
      answer agent. Could delete ~40 lines and the duplicated `OPENROUTER_URL`.
- [ ] **Citation-format regex website branch is misaligned** — it matches
      `– https://` but real website chunk prefixes are `[Titel – document_url |
      Seite N]`; it only passes today via the `| Seite \d` branch. An en-dash
      normalised to a hyphen, or a dropped `Seite` suffix, would score a valid
      citation as 0.
