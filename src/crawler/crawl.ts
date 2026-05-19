import { Fetcher, type FetchResult } from './fetcher';
import { Frontier } from './frontier';
import { extractPage } from './extract-html';
import { isNewspaperPdfUrl, type SiteConfig } from './site-config';
import {
  cachePathForUrl,
  commitCache,
  freshTempCache,
  writeTempFile,
  writeTempManifest,
  type CrawlManifest,
  type EntryKind,
  type ManifestEntry,
} from './cache';

// Crawl phase: link-following breadth-first fetch of the publisher website into
// a fresh on-disk cache. Only raw HTTP bytes are persisted — extraction,
// chunking and embedding happen later in the ingest phase. The cache is built
// in a temp directory and atomically swapped in once the crawl completes.
export async function crawlSite(config: SiteConfig): Promise<CrawlManifest> {
  const startedAt = new Date().toISOString();
  const fetcher = new Fetcher();
  const frontier = new Frontier(config);

  await fetcher.loadRobots(`https://${config.allowedHost}`);
  await freshTempCache();
  frontier.seed();

  const entries: ManifestEntry[] = [];
  const pdfLinks = new Map<string, { anchorText: string; depth: number }>();

  const record = (entry: ManifestEntry): void => {
    entries.push(entry);
    console.log(
      `[${String(entries.length).padStart(4)}] ${entry.outcome.padEnd(5)} ` +
        `${entry.kind}  ${entry.url}`,
    );
  };

  console.log(`crawling ${config.allowedHost} …`);

  for (let item = frontier.next(); item !== undefined; item = frontier.next()) {
    const { url, depth } = item;
    const base = { url, kind: 'html' as const, depth };
    const fetched = await fetchOrRecord(base, fetcher.isAllowed(url), () =>
      fetcher.fetchPage(url),
    );
    if ('entry' in fetched) {
      record(fetched.entry);
      continue;
    }

    const extracted = extractPage(fetched.value, url, config);
    for (const link of extracted.links) frontier.add(link, url, depth + 1);
    for (const pdf of extracted.pdfLinks) {
      if (isNewspaperPdfUrl(pdf.href)) continue; // Amtsblatt — ingested elsewhere.
      if (!pdfLinks.has(pdf.href)) {
        pdfLinks.set(pdf.href, { anchorText: pdf.anchorText, depth: depth + 1 });
      }
    }

    const cacheFile = cachePathForUrl(url, 'html');
    await writeTempFile(cacheFile, fetched.value);
    record({
      ...base,
      outcome: 'ok',
      cacheFile,
      title: extracted.documentTitle,
      editorialDate: extracted.publishedAt,
    });
  }

  if (pdfLinks.size > 0) {
    console.log(`fetching ${pdfLinks.size} linked PDF(s) …`);
  }
  for (const [href, { anchorText, depth }] of pdfLinks) {
    const base = { url: href, kind: 'pdf' as const, depth, anchorText };
    const fetched = await fetchOrRecord(base, fetcher.isAllowed(href), () =>
      fetcher.fetchPdf(href),
    );
    if ('entry' in fetched) {
      record(fetched.entry);
      continue;
    }

    const cacheFile = cachePathForUrl(href, 'pdf');
    await writeTempFile(cacheFile, fetched.value);
    record({ ...base, outcome: 'ok', cacheFile, title: anchorText });
  }

  const manifest: CrawlManifest = {
    startedAt,
    finishedAt: new Date().toISOString(),
    host: config.allowedHost,
    entries,
  };
  await writeTempManifest(manifest);
  await commitCache();
  return manifest;
}

interface EntryBase {
  url: string;
  kind: EntryKind;
  depth: number;
  anchorText?: string;
}

// Runs a fetch through the robots gate and outcome classification: yields the
// fetched value on success, or a ready-to-record failure entry otherwise.
async function fetchOrRecord<T>(
  base: EntryBase,
  allowed: boolean,
  doFetch: () => Promise<FetchResult<T>>,
): Promise<{ value: T } | { entry: ManifestEntry }> {
  if (!allowed) {
    return { entry: { ...base, outcome: 'error', reason: 'robots.txt disallow' } };
  }
  const result = await doFetch();
  if (result.kind === 'gone') {
    return { entry: { ...base, outcome: 'gone', httpStatus: result.status } };
  }
  if (result.kind === 'error') {
    return { entry: { ...base, outcome: 'error', reason: result.reason } };
  }
  return { value: result.value };
}
