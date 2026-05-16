import { describe, expect, it } from 'vitest';
import {
  FilenameContractError,
  checkDateAgainstPageOne,
  extractDateFromPageOne,
  germanFormatDate,
  parseDocumentMetadata,
} from './metadata';

describe('parseDocumentMetadata', () => {
  it('parses a valid DD-MM-YYYY-<slug>.pdf filename', () => {
    const meta = parseDocumentMetadata('docs/15-01-2026-der-kisslegger.pdf');
    expect(meta).toEqual({
      source_type: 'newspaper',
      edition_title: 'Der Kißlegger',
      edition_no: null,
      published_at: '2026-01-15',
      document_url: '15-01-2026-der-kisslegger.pdf',
    });
  });

  it('uses only the basename for document_url', () => {
    const meta = parseDocumentMetadata('/abs/path/15-01-2026-der-kisslegger.pdf');
    expect(meta.document_url).toBe('15-01-2026-der-kisslegger.pdf');
  });

  it('throws on a filename that does not match the contract', () => {
    expect(() => parseDocumentMetadata('newsletter.pdf')).toThrow(FilenameContractError);
  });

  it('throws on a filename with an invalid calendar date', () => {
    expect(() => parseDocumentMetadata('99-99-2026-der-kisslegger.pdf')).toThrow(
      FilenameContractError,
    );
  });

  it('throws on an unknown slug', () => {
    expect(() => parseDocumentMetadata('15-01-2026-unknown-paper.pdf')).toThrow(
      FilenameContractError,
    );
  });
});

describe('extractDateFromPageOne', () => {
  it('extracts a German long-form date', () => {
    expect(extractDateFromPageOne('Amtsblatt vom 15. Januar 2026, Seite 1')).toBe('2026-01-15');
  });

  it('handles umlaut month names', () => {
    expect(extractDateFromPageOne('Ausgabe 3. März 2026')).toBe('2026-03-03');
  });

  it('returns null when no date is present', () => {
    expect(extractDateFromPageOne('Kein Datum hier')).toBeNull();
  });
});

describe('checkDateAgainstPageOne', () => {
  it('passes when the page-one date matches the expected date', () => {
    expect(checkDateAgainstPageOne('2026-01-15', '15. Januar 2026')).toEqual({ ok: true });
  });

  it('passes when the page has no detectable date', () => {
    expect(checkDateAgainstPageOne('2026-01-15', 'no date')).toEqual({ ok: true });
  });

  it('fails and reports the found date on a mismatch', () => {
    expect(checkDateAgainstPageOne('2026-01-15', '20. Januar 2026')).toEqual({
      ok: false,
      found: '2026-01-20',
    });
  });
});

describe('germanFormatDate', () => {
  it('formats an ISO date in German long form', () => {
    expect(germanFormatDate('2026-03-05')).toBe('5. März 2026');
  });
});
