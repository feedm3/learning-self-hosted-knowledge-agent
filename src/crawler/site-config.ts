import { SLUG_MAP } from '../mastra/lib/metadata';
import { safeDecodeURIComponent } from './url-utils';

export interface SiteConfig {
  // Human label for the site; used as the document_title fallback for pages
  // whose <title> is empty.
  siteName: string;
  // Crawl entry points.
  seedUrls: string[];
  // Only pages on this host are crawled; links elsewhere are dropped.
  allowedHost: string;
  // CSS selector for the main content region. If it matches nothing on a page,
  // extraction falls back to a readability heuristic.
  contentSelector: string;
  // Removed from the <title> tag to derive document_title (e.g. ": Gemeinde X").
  titleSuffix: string;
  // A URL whose path contains any of these substrings is out of scope.
  denyPathPatterns: string[];
  // Maximum link-following depth from a seed URL.
  maxDepth: number;
}

export const KISSLEGG: SiteConfig = {
  siteName: 'Gemeinde Kißlegg',
  seedUrls: ['https://www.kisslegg.de/'],
  allowedHost: 'www.kisslegg.de',
  contentSelector: '#content',
  titleSuffix: ': Gemeinde Kißlegg',
  denyPathPatterns: [
    '/fileadmin/templates/',
    '/typo3',
    '/suche',
    '/login',
    '/intern',
  ],
  maxDepth: 6,
};

// Newspaper titles, normalised, from the shared SLUG_MAP. A linked PDF whose URL
// contains one of these is an Amtsblatt edition and is skipped by the crawler —
// the newspaper is ingested through its own PDF flow.
const NEWSPAPER_TITLES = Object.values(SLUG_MAP)
  .filter((s) => s.source_type === 'newspaper')
  .map((s) => normalizeForMatch(s.document_title));

// Percent-decode, case-fold, and treat '_' and '-' as spaces, so a URL segment
// like "Der_Ki%C3%9Flegger" matches the newspaper title "Der Kißlegger".
export function normalizeForMatch(value: string): string {
  return safeDecodeURIComponent(value).toLowerCase().replace(/[_-]+/g, ' ');
}

export function isNewspaperPdfUrl(url: string): boolean {
  const normalized = normalizeForMatch(url);
  return NEWSPAPER_TITLES.some((title) => normalized.includes(title));
}
