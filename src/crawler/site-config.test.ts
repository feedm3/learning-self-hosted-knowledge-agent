import { describe, expect, it } from 'vitest';
import { isNewspaperPdfUrl, normalizeForMatch } from './site-config';

describe('normalizeForMatch', () => {
  it('percent-decodes, case-folds, and treats _/- as spaces', () => {
    expect(normalizeForMatch('Der_Ki%C3%9Flegger')).toBe('der kißlegger');
    expect(normalizeForMatch('rathaus-service')).toBe('rathaus service');
  });
});

describe('isNewspaperPdfUrl', () => {
  it('matches an Amtsblatt PDF whose URL contains the newspaper name', () => {
    const url =
      'https://www.kisslegg.de/fileadmin/Dateien/Website/Dateien/Rathaus-Service/' +
      'Der_Ki%C3%9Flegger/Ki%C3%9Flegger_09.05.2026.pdf';
    expect(isNewspaperPdfUrl(url)).toBe(true);
  });

  it('does not match an unrelated site PDF', () => {
    const url = 'https://www.kisslegg.de/fileadmin/Dateien/antrag-hundesteuer.pdf';
    expect(isNewspaperPdfUrl(url)).toBe(false);
  });
});
