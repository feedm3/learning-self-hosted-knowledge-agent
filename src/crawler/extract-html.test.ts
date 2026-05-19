import { describe, expect, it } from 'vitest';
import { extractPage } from './extract-html';
import type { SiteConfig } from './site-config';

const CONFIG: SiteConfig = {
  siteName: 'Gemeinde Kißlegg',
  seedUrls: ['https://www.kisslegg.de/'],
  allowedHost: 'www.kisslegg.de',
  contentSelector: '#content',
  titleSuffix: ': Gemeinde Kißlegg',
  denyPathPatterns: [],
  maxDepth: 6,
};

const URL = 'https://www.kisslegg.de/buerger/gewerbeflaechen';

const PAGE = `<!doctype html><html><head>
  <title>Gewerbeflächen: Gemeinde Kißlegg</title>
  <meta name="article:published_time" content="2020-06-03T08:51:16+02:00" />
  <meta name="article:modified_time" content="2026-05-05T08:01:13+02:00" />
</head><body>
  <nav><a href="/buerger/start">Startseite</a></nav>
  <div id="content">
    <h1>Gewerbeflächen</h1>
    <p>Einleitender Absatz.</p>
    <h2>Verfügbare Flächen</h2>
    <p>Beschreibung der Flächen.</p>
    <ul><li>Fläche eins</li><li>Fläche zwei</li></ul>
    <a href="/fileadmin/Dateien/antrag.pdf">Antrag herunterladen</a>
  </div>
  <footer><a href="/impressum">Impressum</a></footer>
</body></html>`;

describe('extractPage', () => {
  const result = extractPage(PAGE, URL, CONFIG);

  it('derives document_title from <title>, stripping the site suffix', () => {
    expect(result.documentTitle).toBe('Gewerbeflächen');
  });

  it('prefers og:title when present', () => {
    const withOg = PAGE.replace(
      '<title>Gewerbeflächen: Gemeinde Kißlegg</title>',
      '<title>Gewerbeflächen: Gemeinde Kißlegg</title><meta property="og:title" content="Gewerbeflächen Kißlegg" />',
    );
    expect(extractPage(withOg, URL, CONFIG).documentTitle).toBe('Gewerbeflächen Kißlegg');
  });

  it('uses article:modified_time as the publication date (date part only)', () => {
    expect(result.publishedAt).toBe('2026-05-05');
  });

  it('returns null publishedAt when no article meta is present', () => {
    const noMeta = PAGE.replace(/<meta name="article:[^>]*>/g, '');
    expect(extractPage(noMeta, URL, CONFIG).publishedAt).toBeNull();
  });

  it('builds heading-aware sections from the content region', () => {
    expect(result.sections).toEqual([
      { headingPath: ['Gewerbeflächen'], paragraphs: ['Einleitender Absatz.'] },
      {
        headingPath: ['Gewerbeflächen', 'Verfügbare Flächen'],
        paragraphs: ['Beschreibung der Flächen.', 'Fläche eins', 'Fläche zwei'],
      },
    ]);
  });

  it('excludes nav and footer boilerplate from sections', () => {
    const allText = result.sections.flatMap((s) => s.paragraphs).join(' ');
    expect(allText).not.toContain('Startseite');
    expect(allText).not.toContain('Impressum');
  });

  it('collects PDF links with their anchor text', () => {
    expect(result.pdfLinks).toEqual([
      {
        href: 'https://www.kisslegg.de/fileadmin/Dateien/antrag.pdf',
        anchorText: 'Antrag herunterladen',
      },
    ]);
  });

  it('collects in-page links for the frontier', () => {
    expect(result.links).toContain('https://www.kisslegg.de/buerger/start');
    expect(result.links).toContain('https://www.kisslegg.de/impressum');
  });
});
