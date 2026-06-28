# Project backlog

Working backlog for the project — currently focused on the eval harness and the
answer agent. See [ADR 0006](./docs/adr/0006-evals-via-evalite.md) for the eval
design and [`CONTEXT.md`](./CONTEXT.md) for the glossary. Run the evals with
`pnpm run eval:fixture` (build the frozen corpus once) then `pnpm run eval`
(needs `pnpm run infra:dev` for Ollama; `OPENROUTER_API_KEY` for the generation
eval).

## Baseline (last measured)

Retrieval, measured 2026-06-27 against the **frozen fixture** (`eval-chunks.db` =
32-page website fixture + 3 newspaper editions; `pnpm run eval:fixture && pnpm
run eval`):

| category               | recall@5 | recall@20 | MRR |
| ---------------------- | -------- | --------- | --- |
| single-chunk-factual   | 80%      | 80%       | 66% |
| multi-chunk-synthesis  | 79%      | 79%       | 65% |
| source-routing-recency | 100%     | 100%      | 62% |

> recall@5 == recall@20 in every category: the misses are *total* misses (gold
> absent from top-20), not just mis-ranking. With the hard negatives in place,
> the newest edition `06-06-2026-der-kisslegger.pdf` ranks **#1 in every missed
> website query** (sf-02 Bürgermeister, sf-07 Abfall, sf-15 Autobahn, ms-06
> Ortschaften, ms-10 Ortsverwaltungen, ms-05 Partnergemeinden). This is the P2
> cross-source-ranking problem, now reproducible — the 1.5× newspaper
> `source_weight` starves website-answerable queries.

Generation: **not re-measured** — the generation eval needs a valid
`OPENROUTER_API_KEY` (the dev key currently returns 401 "User not found"). Once a
key is set, `pnpm run eval` runs both layers against the frozen DB.

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

## P1 — make the eval reproducible — DONE

The evals used to be **not hermetic**: they ran the real `answerAgent` against
whatever was in the shared dev `data/chunks.db` plus a *live* re-crawl of
kisslegg.de that drifted from the gold labels. Now there is a frozen, isolated
fixture. Reproducible flow:

```bash
pnpm run eval:fixture   # build subset → wipe eval-chunks.db → ingest pdf+website
pnpm run eval           # scores against the isolated eval-chunks.db
```

- [x] **Commit a frozen eval crawl-cache subset.** `evals/fixtures/crawl-cache/`
      (32 HTML pages: 17 gold + 15 hard negatives + 1 gone), a committed subset
      of the 2026-05-18 crawl. `crawl-cache` is now anchored to root in
      `.gitignore` with a `!evals/fixtures/crawl-cache/` exception.
      `src/crawler/cache.ts` reads `CRAWL_CACHE_DIR` so ingest can target it.
      `scripts/build-eval-fixture.ts` rebuilds it from a live crawl + the curated
      negatives list.
- [x] **Isolate the eval database.** `pnpm run eval` / `eval:watch` /
      `eval:fixture:ingest` set `CHUNKS_DB_URL=file://$PWD/data/eval-chunks.db`,
      so eval state is built only from the fixture and can't be polluted by dev
      `chunks.db` activity. (`eval-chunks.db` stays gitignored — regenerated.)
- [x] **Frozen subset = deterministic core + agentic curation.** Core =
      `union(website relevantDocUrls)` (AI-free, in `build-eval-fixture.ts`).
      Hard negatives picked by the `curate-hard-negatives` Dynamic Workflow
      (proposers per query category → lean coverage-balanced selector) over the
      manifest's sibling+boilerplate candidates; result in
      `evals/fixtures/hard-negatives.json` with per-page rationale + displaced
      query ids. Lean/HTML-only (no large PDFs).
- [x] **Stamp the corpus version.** `evals/dataset.ts` header records the labels
      were verified against the crawl of 2026-05-18, and points at the fixture.
- [x] **Re-measure retrieval against the frozen corpus.** Done 2026-06-27 — see
      the baseline table above. Generation still pending a valid
      `OPENROUTER_API_KEY`.

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

- [ ] **Tune cross-source ranking — now the top finding, now reproducible.**
      Against the frozen fixture the newest edition `06-06-2026-der-kisslegger.pdf`
      is #1 in every missed website query — the 1.5× newspaper `source_weight`
      crowds out correct website pages for website-answerable queries. Re-tune
      `source_weight` and re-run `pnpm run eval:fixture && pnpm run eval` (now a
      stable A/B baseline) so the newspaper boost does not starve the website.
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
