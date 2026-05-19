import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { normalizeUrl } from './frontier';
import type { SiteConfig } from './site-config';

export interface Section {
  // Heading breadcrumb at the point this content appeared, e.g.
  // ['Rathaus & Service', 'Bürgerservice']. Empty for content before any heading.
  headingPath: string[];
  paragraphs: string[];
}

export interface ExtractedPage {
  url: string;
  documentTitle: string;
  // ISO date (YYYY-MM-DD) from article meta tags, or null when the page carries
  // no editorial date (the normal case for static informational pages).
  publishedAt: string | null;
  sections: Section[];
  // All in-page hrefs, for the crawl frontier to consider.
  links: string[];
  pdfLinks: { href: string; anchorText: string }[];
}

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dd,figcaption,td';

export function extractPage(
  html: string,
  url: string,
  config: SiteConfig,
): ExtractedPage {
  const { document } = parseHTML(html);

  const documentTitle = deriveTitle(document, config);
  const publishedAt = deriveEditorialDate(document);
  const links = collectLinks(document, url);
  const pdfLinks = collectPdfLinks(document, url);

  const root = selectContentRoot(document, config);
  const sections = root ? walkSections(root) : [];

  return { url, documentTitle, publishedAt, sections, links, pdfLinks };
}

function deriveTitle(document: Document, config: SiteConfig): string {
  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content')
    ?.trim();
  if (ogTitle) return ogTitle;

  const titleTag = document.querySelector('title')?.textContent?.trim() ?? '';
  const stripped = titleTag.endsWith(config.titleSuffix)
    ? titleTag.slice(0, -config.titleSuffix.length).trim()
    : titleTag;
  return stripped || config.siteName;
}

function deriveEditorialDate(document: Document): string | null {
  const pick = (name: string): string | null =>
    document
      .querySelector(`meta[name="${name}"]`)
      ?.getAttribute('content')
      ?.trim() ?? null;
  const raw = pick('article:modified_time') ?? pick('article:published_time');
  if (!raw) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  return match ? match[0] : null;
}

function collectLinks(document: Document, base: string): string[] {
  return [...document.querySelectorAll('a[href]')]
    .map((a) => a.getAttribute('href') ?? '')
    .filter((href) => href.length > 0)
    .map((href) => normalizeUrl(href, base))
    .filter((href): href is string => href !== null);
}

function collectPdfLinks(
  document: Document,
  base: string,
): { href: string; anchorText: string }[] {
  const out: { href: string; anchorText: string }[] = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const resolved = normalizeUrl(a.getAttribute('href') ?? '', base);
    if (resolved === null) continue;
    const path = new URL(resolved).pathname.toLowerCase();
    if (!path.endsWith('.pdf')) continue;
    const anchorText = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    out.push({ href: resolved, anchorText });
  }
  return out;
}

// Prefers the configured content selector; falls back to a readability
// heuristic, and finally to the whole <body>.
function selectContentRoot(
  document: Document,
  config: SiteConfig,
): Element | null {
  const selected = document.querySelector(config.contentSelector);
  if (selected) return selected;

  try {
    const article = new Readability(document as unknown as Document).parse();
    if (article?.content) {
      const { document: fragment } = parseHTML(
        `<body>${article.content}</body>`,
      );
      return fragment.body;
    }
  } catch {
    // Readability failed — fall through to the body.
  }
  return document.body ?? null;
}

function walkSections(root: Element): Section[] {
  const sections: Section[] = [];
  const headingStack: string[] = [];
  let current: Section = { headingPath: [], paragraphs: [] };

  const flush = (): void => {
    if (current.paragraphs.length > 0) sections.push(current);
  };

  for (const node of root.querySelectorAll(BLOCK_SELECTOR)) {
    const tag = node.tagName.toLowerCase();
    const isHeading = /^h[1-6]$/.test(tag);
    // Skip non-leaf blocks; their inner blocks are captured on their own.
    if (!isHeading && node.querySelector(BLOCK_SELECTOR)) continue;

    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;

    if (isHeading) {
      const level = Number(tag[1]);
      headingStack.length = level - 1;
      headingStack[level - 1] = text;
      flush();
      current = {
        headingPath: headingStack.filter((h) => h && h.length > 0),
        paragraphs: [],
      };
    } else {
      current.paragraphs.push(text);
    }
  }
  flush();
  return sections;
}
