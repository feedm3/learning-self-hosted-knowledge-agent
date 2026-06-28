import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeDecodeURIComponent } from './url-utils';

// Defaults to the live `crawl-cache/`. Overridable via CRAWL_CACHE_DIR so the
// eval harness can ingest a small committed fixture instead of the live crawl
// (mirrors the CHUNKS_DB_URL override in chunk-store). The temp dir used by the
// atomic-swap crawl stays adjacent to whichever cache dir is active.
export const CACHE_DIR = path.resolve(process.env.CRAWL_CACHE_DIR ?? 'crawl-cache');
const TMP_DIR = `${CACHE_DIR}.tmp`;
const MANIFEST_NAME = 'manifest.json';

export type EntryKind = 'html' | 'pdf';
export type EntryOutcome = 'ok' | 'gone' | 'error';

export interface ManifestEntry {
  url: string;
  kind: EntryKind;
  outcome: EntryOutcome;
  // Cache-relative path of the raw file. Present only when outcome === 'ok'.
  cacheFile?: string;
  depth: number;
  httpStatus?: number;
  reason?: string;
  title?: string;
  editorialDate?: string | null;
  anchorText?: string;
}

// The source of truth for one crawl: every URL the crawl touched, its outcome,
// and where its raw bytes landed in the cache.
export interface CrawlManifest {
  startedAt: string;
  finishedAt: string;
  host: string;
  entries: ManifestEntry[];
}

// Maps a URL to its cache-relative file path. HTML pages are stored as
// `<path>/index.html` so that `/a` and `/a/b` never collide on the filesystem;
// PDFs keep their real filename.
export function cachePathForUrl(rawUrl: string, kind: EntryKind): string {
  const segments = new URL(rawUrl).pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map(decodeSegment);
  return kind === 'pdf'
    ? segments.join('/')
    : [...segments, 'index.html'].join('/');
}

function decodeSegment(segment: string): string {
  return safeDecodeURIComponent(segment).replace(/[\\/:*?"<>|]/g, '_');
}

export async function freshTempCache(): Promise<void> {
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
}

export async function writeTempFile(
  relPath: string,
  data: Uint8Array | string,
): Promise<void> {
  const full = path.join(TMP_DIR, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function writeTempManifest(manifest: CrawlManifest): Promise<void> {
  await writeTempFile(MANIFEST_NAME, JSON.stringify(manifest, null, 2));
}

// Replaces the live cache with the temp cache in one atomic rename. Called only
// after a crawl completes, so a crashed crawl leaves the previous cache intact.
export async function commitCache(): Promise<void> {
  await rm(CACHE_DIR, { recursive: true, force: true });
  await rename(TMP_DIR, CACHE_DIR);
}

export function cacheExists(): boolean {
  return existsSync(path.join(CACHE_DIR, MANIFEST_NAME));
}

export async function readManifest(): Promise<CrawlManifest> {
  const raw = await readFile(path.join(CACHE_DIR, MANIFEST_NAME), 'utf8');
  return JSON.parse(raw) as CrawlManifest;
}

export async function readCachedText(relPath: string): Promise<string> {
  return readFile(path.join(CACHE_DIR, relPath), 'utf8');
}

export function cacheFileAbsPath(relPath: string): string {
  return path.join(CACHE_DIR, relPath);
}
