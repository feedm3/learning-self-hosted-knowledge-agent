// Builds the frozen eval crawl-cache fixture: a tiny, committed subset of the
// live crawl-cache that the retrieval/generation evals ingest, so eval scores
// stop drifting with live re-crawls of kisslegg.de. See TODO.md "P1 — make the
// eval reproducible" and ADR 0006.
//
// Input  (NOT committed): the author's live `crawl-cache/manifest.json` + bytes.
// Input  (committed):     `evals/fixtures/hard-negatives.json` (curated list).
// Output (committed):     `evals/fixtures/crawl-cache/` (trimmed manifest + the
//                         raw HTML/PDF bytes of the selected pages only).
//
// Selection = deterministic core ∪ hard negatives:
//   - core:      union of every website gold `document_url` in the dataset — the
//                minimal covering set, AI-free (the labels already list them).
//   - negatives: plausible-but-wrong sibling/boilerplate pages, curated by the
//                `curate-hard-negatives` workflow, so the small corpus still
//                stresses ranking instead of letting recall look artificially high.
//
// Newspaper editions are NOT included here — they are committed PDFs ingested via
// `pnpm run ingest:pdf`. This fixture is website-only.
//
// Run from repo root, with the live cache present:
//   tsx scripts/build-eval-fixture.ts

import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { dataset } from '../evals/dataset.ts';
import type { CrawlManifest, ManifestEntry } from '../src/crawler/cache.ts';

const LIVE_CACHE = path.resolve('crawl-cache');
const FIXTURE_DIR = path.resolve('evals/fixtures/crawl-cache');
const NEGATIVES_FILE = path.resolve('evals/fixtures/hard-negatives.json');

// A handful of confirmed-gone URLs to keep the orphan-sweep code path exercised
// during fixture ingest. They carry no bytes (gone entries have no cacheFile).
const GONE_FIXTURE_URLS = [
  'https://www.kisslegg.de/buerger/_eval-fixture-removed-page',
];

interface HardNegative {
  url: string;
  rationale?: string;
  displaces?: string[];
}

function websiteGoldUrls(): string[] {
  // route() queries use bare *.pdf filenames (newspaper editions); website
  // queries use full http(s) URLs. Keep only the latter.
  const urls = new Set<string>();
  for (const q of dataset) {
    for (const u of q.relevantDocUrls) {
      if (/^https?:\/\//.test(u)) urls.add(u);
    }
  }
  return [...urls];
}

const norm = (u: string) => u.replace(/\/$/, '');

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(LIVE_CACHE, 'manifest.json'), 'utf8'),
  ) as CrawlManifest;

  const byUrl = new Map<string, ManifestEntry>();
  for (const e of manifest.entries) {
    if (e.outcome === 'ok' && e.cacheFile) byUrl.set(norm(e.url), e);
  }

  const negatives = JSON.parse(
    await readFile(NEGATIVES_FILE, 'utf8'),
  ) as { selected: HardNegative[] };

  const gold = websiteGoldUrls();
  const negUrls = negatives.selected.map((n) => n.url);
  const wanted = [...new Set([...gold, ...negUrls].map(norm))];

  const selected: ManifestEntry[] = [];
  const missing: string[] = [];
  for (const url of wanted) {
    const entry = byUrl.get(url);
    if (entry) selected.push(entry);
    else missing.push(url);
  }

  if (missing.length) {
    console.error(
      `\n${missing.length} wanted page(s) not found as ok+cached in the live ` +
        `crawl-cache — re-crawl, or drop them from the gold/negatives:`,
    );
    for (const u of missing) console.error(`  - ${u}`);
    process.exit(1);
  }

  // Fresh fixture dir, then copy each selected page's raw bytes.
  await rm(FIXTURE_DIR, { recursive: true, force: true });
  await mkdir(FIXTURE_DIR, { recursive: true });
  for (const entry of selected) {
    const rel = entry.cacheFile!;
    const dest = path.join(FIXTURE_DIR, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(LIVE_CACHE, rel), dest);
  }

  const goneEntries: ManifestEntry[] = GONE_FIXTURE_URLS.map((url) => ({
    url,
    kind: 'html',
    outcome: 'gone',
    depth: 1,
    httpStatus: 404,
  }));

  const fixtureManifest: CrawlManifest = {
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    host: manifest.host,
    entries: [...selected, ...goneEntries],
  };
  await writeFile(
    path.join(FIXTURE_DIR, 'manifest.json'),
    JSON.stringify(fixtureManifest, null, 2),
  );

  const htmlCount = selected.filter((e) => e.kind === 'html').length;
  const pdfCount = selected.filter((e) => e.kind === 'pdf').length;
  console.log(
    `fixture written to ${path.relative(process.cwd(), FIXTURE_DIR)}\n` +
      `  ${selected.length} page(s): ${gold.length} gold, ${negUrls.length} hard-negative ` +
      `(${htmlCount} html, ${pdfCount} pdf) + ${goneEntries.length} gone\n` +
      `  source crawl: ${manifest.startedAt}`,
  );
}

await main();
