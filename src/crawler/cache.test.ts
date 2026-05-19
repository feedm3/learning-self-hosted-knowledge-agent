import { describe, expect, it } from 'vitest';
import { cachePathForUrl } from './cache';

describe('cachePathForUrl', () => {
  it('maps the homepage to index.html', () => {
    expect(cachePathForUrl('https://www.kisslegg.de/', 'html')).toBe('index.html');
  });

  it('stores an HTML page as <path>/index.html', () => {
    expect(
      cachePathForUrl('https://www.kisslegg.de/buerger/rathaus-service/amtsblatt', 'html'),
    ).toBe('buerger/rathaus-service/amtsblatt/index.html');
  });

  it('never collides /a with /a/b', () => {
    const a = cachePathForUrl('https://www.kisslegg.de/a', 'html');
    const ab = cachePathForUrl('https://www.kisslegg.de/a/b', 'html');
    expect(a).toBe('a/index.html');
    expect(ab).toBe('a/b/index.html');
    // `a` is a directory in both cases — no file/directory conflict.
    expect(ab.startsWith('a/')).toBe(true);
  });

  it('keeps the real filename for a PDF', () => {
    expect(
      cachePathForUrl('https://www.kisslegg.de/fileadmin/Dateien/antrag.pdf', 'pdf'),
    ).toBe('fileadmin/Dateien/antrag.pdf');
  });

  it('percent-decodes path segments for a readable tree', () => {
    expect(
      cachePathForUrl('https://www.kisslegg.de/Der_Ki%C3%9Flegger/info', 'html'),
    ).toBe('Der_Kißlegger/info/index.html');
  });
});
