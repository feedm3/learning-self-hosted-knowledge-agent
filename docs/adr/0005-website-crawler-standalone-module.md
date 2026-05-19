# ADR 0005 — Website crawler is a standalone module, not a Mastra workflow

**Status:** Accepted
**Date:** 2026-05-16

## Context

PDF ingestion is a Mastra workflow (`ingestPdfWorkflow`): one document in, a fixed
linear pipeline, registered in `src/mastra/index.ts`. Website ingestion is a
different shape — a breadth-first crawl of `kisslegg.de` that discovers pages by
link-following, fetches a few hundred pages under a politeness budget (concurrency
2, ~500ms delay), extracts and chunks each, then runs an orphan sweep. The natural
assumption for a Mastra-built project is that the crawl would also be a workflow.

## Decision

Build the crawler as a **standalone module** (a `src/crawler/` library plus a
`scripts/` entry point run via a pnpm script). It is **not** a Mastra workflow and
is **not** registered in `src/mastra/index.ts`.

It reuses the shared ingestion libraries directly — `chunker`, `embedder`
(`embedTexts`), and `chunk-store` (`replaceDocumentChunks`) — so the embed-and-store
tail is identical to the PDF path and the combined vector index stays single.

Scheduling (periodic re-crawls) is deferred and will be layered on later — the
crawl is run manually.

### Two-phase pipeline with an on-disk crawl cache

The crawl is split into two separately-invoked phases around a gitignored
on-disk **crawl cache**:

- `crawl:website` — fetches every reachable page and writes the raw HTTP bytes
  (HTML and PDF) into the cache, a directory tree mirroring the URL paths, plus
  a root `manifest.json` recording per-URL outcome (`ok`/`gone`/`error`), cache
  path, depth, title, editorial date, and each linked PDF's anchor text. The
  cache is built in a temp directory and atomically swapped into place only on
  success, so a crashed crawl leaves the previous good snapshot intact.
- `ingest:website` — reads the cache (extract → chunk → embed → store), then runs
  the orphan sweep using the manifest's confirmed-gone set.

This trades a single-pass crawler for two commands and an on-disk intermediate.
The reasons: a downstream failure (notably embedding, which depends on a running
Ollama) can be retried without re-fetching the whole site under the politeness
budget; and the raw crawled pages can be inspected by hand between the phases.
The cache is a snapshot of the latest crawl only — `crawl:website` replaces it
wholesale — which keeps the full-re-crawl + orphan-sweep model intact.

### Crawl stack

The crawler is composed from small libraries rather than a crawling framework:
native `fetch` for HTTP, `linkedom` for a spec DOM, `@mozilla/readability` as the
content-extraction fallback, `p-queue` for concurrency limiting, and a hand-written
BFS frontier (~100–150 LOC: URL normalization, scope/deny filtering, dedup, depth).

`linkedom` is chosen over `cheerio` because it exposes a real DOM `document`, which
both the per-site CSS content selector and `@mozilla/readability` consume from a
single parse. `cheerio` is not a DOM and cannot drive readability.

## Considered options

- **Mastra workflow with `.foreach` over discovered URLs.** Rejected: BFS discovery
  is iterative (the URL set is not known up front), and per-page rate-limiting,
  concurrency control, retries and the orphan sweep are awkward to express as
  workflow steps. A plain module gives direct control over the crawl frontier.
- **One unified `ingestWorkflow` branching on input type.** Rejected: mixes two
  unrelated ingestion shapes behind one conditional entry point.
- **Crawlee (`@crawlee/cheerio` / CheerioCrawler).** A production crawling
  framework — BFS queue, autoscaling concurrency, retries, robots.txt, dedup all
  built in, browser-free. Rejected for this scope: the target is one small
  server-rendered municipal site of a few hundred pages with no anti-bot defences,
  so Crawlee's anti-blocking machinery (fingerprinting, proxy rotation) is dead
  weight, and it brings a large dependency tree, opinionated abstractions
  (RequestQueue/Dataset) and on-disk storage state. This mirrors the ADR 0004
  reasoning that rejected Docling: own the ~100 lines of the actual problem rather
  than adopt a heavy framework. Revisit if crawl scope grows to many sites or
  hostile targets.
- **Headless browser (Playwright/Puppeteer).** Rejected: kisslegg.de is
  server-rendered (full HTML and meta tags present without JS execution), so a
  browser binary adds only weight. Revisit only if JS-rendered pages appear.

## Consequences

- The crawl does not get Mastra's per-step observability/durability. Acceptable:
  the crawl is a batch job, restartable from scratch, and emits its own end-of-run
  summary (console + timestamped report file).
- The decision is revisitable — if scheduling or partial-failure recovery later
  needs workflow semantics, the module's embed/store reuse means a workflow wrapper
  could be added without rewriting the ingestion core.
