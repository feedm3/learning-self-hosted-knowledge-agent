import type { Document } from '../mastra/lib/chunker';
import { indexDocument } from '../mastra/lib/document-index';
import {
  deleteDocument,
  listWebsiteDocumentUrls,
} from '../mastra/lib/chunk-store';
import { extractPage } from './extract-html';
import { chunkHtmlPage } from './chunk-html';
import { sitePdfToDocument } from './site-pdf';
import {
  cacheFileAbsPath,
  readCachedText,
  readManifest,
  type ManifestEntry,
} from './cache';
import type { SiteConfig } from './site-config';
import type { IngestReport, PageResult } from './report';

// Ingest phase: reads the on-disk crawl cache, turns each cached page into
// chunks, embeds and stores them, then sweeps chunks of pages the crawl
// confirmed are gone. Re-runnable without re-fetching the site.
export async function ingestCrawlCache(config: SiteConfig): Promise<IngestReport> {
  const startedAt = new Date().toISOString();
  const manifest = await readManifest();

  const ageMs = Date.now() - new Date(manifest.startedAt).getTime();
  console.log(
    `crawl cache: crawled ${manifest.startedAt} (${formatAge(ageMs)} ago), ` +
      `${manifest.entries.length} entries`,
  );

  const pages: PageResult[] = [];
  const errors: { url: string; reason: string }[] = [];

  const ingestable = manifest.entries.filter(
    (e): e is ManifestEntry & { cacheFile: string } =>
      e.outcome === 'ok' && e.cacheFile !== undefined,
  );
  console.log(`ingesting ${ingestable.length} page(s) …`);

  let done = 0;
  for (const entry of ingestable) {
    done += 1;
    const prefix = `[${String(done).padStart(4)}/${ingestable.length}]`;
    try {
      let document: Document;
      if (entry.kind === 'html') {
        const html = await readCachedText(entry.cacheFile);
        document = chunkHtmlPage(extractPage(html, entry.url, config));
      } else {
        document = await sitePdfToDocument(
          cacheFileAbsPath(entry.cacheFile),
          entry.url,
          entry.anchorText ?? '',
        );
      }
      await indexDocument(document);
      pages.push({
        url: entry.url,
        title: entry.title ?? entry.url,
        publishedAt: entry.editorialDate ?? null,
        chunkCount: document.bodies.length,
        kind: entry.kind,
      });
      console.log(
        `${prefix} ok     ${entry.kind}  ${String(document.bodies.length).padStart(3)} chunk(s)  ${entry.url}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ url: entry.url, reason });
      console.log(`${prefix} error  ${entry.kind}  ${entry.url} — ${reason}`);
    }
  }

  // Only pages the crawl positively confirmed as gone (404/410) are swept.
  const goneUrls = manifest.entries
    .filter((e) => e.outcome === 'gone')
    .map((e) => e.url);
  const swept: string[] = [];
  if (goneUrls.length > 0) {
    console.log(`sweeping ${goneUrls.length} gone page(s) …`);
    const indexed = new Set(await listWebsiteDocumentUrls());
    for (const url of goneUrls) {
      if (indexed.has(url)) {
        await deleteDocument(url);
        swept.push(url);
        console.log(`  swept  ${url}`);
      }
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    crawlStartedAt: manifest.startedAt,
    pages,
    errors,
    swept,
  };
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
