import { describe, expect, it } from 'vitest';
import { Frontier, normalizeUrl } from './frontier';
import type { SiteConfig } from './site-config';

const CONFIG: SiteConfig = {
  siteName: 'Test',
  seedUrls: ['https://www.example.de/'],
  allowedHost: 'www.example.de',
  contentSelector: '#content',
  titleSuffix: ': Test',
  denyPathPatterns: ['/intern/', '/fileadmin/templates/'],
  maxDepth: 2,
};

describe('normalizeUrl', () => {
  it('resolves a relative href against the base', () => {
    expect(normalizeUrl('/a/b', 'https://www.example.de/x')).toBe(
      'https://www.example.de/a/b',
    );
  });

  it('drops the fragment', () => {
    expect(normalizeUrl('https://www.example.de/a#top', 'https://www.example.de/')).toBe(
      'https://www.example.de/a',
    );
  });

  it('returns null for an unparseable href', () => {
    expect(normalizeUrl('http://', 'not a base')).toBeNull();
  });
});

describe('Frontier', () => {
  it('enqueues seed URLs', () => {
    const f = new Frontier(CONFIG);
    f.seed();
    expect(f.size).toBe(1);
    expect(f.next()?.url).toBe('https://www.example.de/');
  });

  it('rejects links to other hosts', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('https://evil.com/x', 'https://www.example.de/', 1)).toBeNull();
  });

  it('rejects URLs with a query string', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('/search?q=x', 'https://www.example.de/', 1)).toBeNull();
  });

  it('rejects denied path patterns', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('/intern/secret', 'https://www.example.de/', 1)).toBeNull();
    expect(
      f.add('/fileadmin/templates/css/main.css', 'https://www.example.de/', 1),
    ).toBeNull();
  });

  it('rejects non-HTML asset extensions', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('/doc.pdf', 'https://www.example.de/', 1)).toBeNull();
    expect(f.add('/img.png', 'https://www.example.de/', 1)).toBeNull();
  });

  it('rejects URLs beyond max depth', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('/deep', 'https://www.example.de/', 3)).toBeNull();
  });

  it('deduplicates already-seen URLs', () => {
    const f = new Frontier(CONFIG);
    expect(f.add('/page', 'https://www.example.de/', 1)).not.toBeNull();
    expect(f.add('/page', 'https://www.example.de/', 1)).toBeNull();
  });

  it('drains in breadth-first (FIFO) order', () => {
    const f = new Frontier(CONFIG);
    f.add('/a', 'https://www.example.de/', 1);
    f.add('/b', 'https://www.example.de/', 1);
    expect(f.next()?.url).toBe('https://www.example.de/a');
    expect(f.next()?.url).toBe('https://www.example.de/b');
    expect(f.next()).toBeUndefined();
  });
});
