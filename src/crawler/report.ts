import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlManifest, EntryKind } from './cache';

export interface PageResult {
  url: string;
  title: string;
  publishedAt: string | null;
  chunkCount: number;
  kind: EntryKind;
}

export interface IngestReport {
  startedAt: string;
  finishedAt: string;
  // When the consumed crawl cache was crawled.
  crawlStartedAt: string;
  pages: PageResult[];
  errors: { url: string; reason: string }[];
  swept: string[];
}

const REPORTS_DIR = path.resolve('crawl-reports');

export function printCrawlSummary(manifest: CrawlManifest): void {
  const counts = { ok: 0, gone: 0, error: 0 };
  for (const e of manifest.entries) counts[e.outcome] += 1;

  console.log('\n=== Crawl summary ===');
  console.log(`started:  ${manifest.startedAt}`);
  console.log(`finished: ${manifest.finishedAt}`);
  console.log(
    `fetched:  ${counts.ok} ok, ${counts.gone} gone, ${counts.error} error\n`,
  );

  console.log('date        outcome  kind  document');
  console.log('----------  -------  ----  --------');
  const sorted = [...manifest.entries].sort((a, b) =>
    (b.editorialDate ?? '').localeCompare(a.editorialDate ?? ''),
  );
  for (const e of sorted) {
    const date = (e.editorialDate ?? '—').padEnd(10);
    const outcome = e.outcome.padEnd(7);
    const kind = e.kind.padEnd(4);
    console.log(`${date}  ${outcome}  ${kind}  ${e.title ?? e.url}`);
  }
}

export function printIngestReport(report: IngestReport): void {
  console.log('\n=== Ingest summary ===');
  console.log(`crawl cache from: ${report.crawlStartedAt}`);
  console.log(`started:  ${report.startedAt}`);
  console.log(`finished: ${report.finishedAt}`);
  console.log(
    `ingested: ${report.pages.length} documents ` +
      `(${report.pages.filter((p) => p.kind === 'html').length} html, ` +
      `${report.pages.filter((p) => p.kind === 'pdf').length} pdf)`,
  );
  console.log(`errors:   ${report.errors.length}`);
  console.log(`swept:    ${report.swept.length} orphaned document(s)\n`);

  console.log('date        chunks  kind  document');
  console.log('----------  ------  ----  --------');
  for (const page of [...report.pages].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  )) {
    const date = (page.publishedAt ?? '—').padEnd(10);
    const chunks = String(page.chunkCount).padStart(6);
    const kind = page.kind.padEnd(4);
    console.log(`${date}  ${chunks}  ${kind}  ${page.title} — ${page.url}`);
  }

  if (report.errors.length > 0) {
    console.log('\nerrors:');
    for (const e of report.errors) console.log(`  ${e.url} — ${e.reason}`);
  }
  if (report.swept.length > 0) {
    console.log('\nswept (confirmed gone):');
    for (const url of report.swept) console.log(`  ${url}`);
  }
}

// Writes the ingest report as JSON into the gitignored crawl-reports/ directory
// and returns its path.
export async function writeIngestReport(report: IngestReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = report.finishedAt.replace(/[:.]/g, '-');
  const filePath = path.join(REPORTS_DIR, `crawl-report-${stamp}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}
