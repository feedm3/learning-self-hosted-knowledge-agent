import type { SiteConfig } from './site-config';

export interface FrontierItem {
  url: string;
  depth: number;
}

// File extensions that are never HTML pages — PDFs are discovered and handled
// separately, the rest are assets.
const NON_HTML_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.css', '.js', '.json', '.xml', '.zip', '.doc', '.docx', '.xls', '.xlsx',
  '.mp4', '.mp3', '.woff', '.woff2', '.ttf',
];

// Resolves a (possibly relative) href, dropping the fragment. Null if unparseable.
export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

// A breadth-first crawl frontier: dedups, bounds depth, and keeps the crawl
// inside the configured host and away from denied paths and non-HTML assets.
export class Frontier {
  private readonly queue: FrontierItem[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly config: SiteConfig) {}

  seed(): void {
    for (const url of this.config.seedUrls) {
      this.add(url, url, 0);
    }
  }

  add(href: string, base: string, depth: number): string | null {
    const url = normalizeUrl(href, base);
    if (url === null) return null;
    if (depth > this.config.maxDepth) return null;
    if (this.seen.has(url)) return null;
    if (!this.isInScope(url)) return null;

    this.seen.add(url);
    this.queue.push({ url, depth });
    return url;
  }

  next(): FrontierItem | undefined {
    return this.queue.shift();
  }

  get size(): number {
    return this.queue.length;
  }

  isInScope(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.host !== this.config.allowedHost) return false;
    if (parsed.search.length > 0) return false;

    const path = parsed.pathname.toLowerCase();
    if (NON_HTML_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
    if (this.config.denyPathPatterns.some((p) => path.includes(p.toLowerCase()))) {
      return false;
    }
    return true;
  }
}
