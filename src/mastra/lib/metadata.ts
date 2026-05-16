import path from 'node:path';

export type SourceType = 'newspaper' | 'website';

export interface DocumentMetadata {
  source_type: SourceType;
  published_at: string;
  edition_title: string;
  edition_no: number | null;
  document_url: string;
}

export interface SlugConfig {
  edition_title: string;
  source_type: SourceType;
}

export type SlugMap = Record<string, SlugConfig>;

export const SLUG_MAP: SlugMap = {
  'der-kisslegger': { edition_title: 'Der Kißlegger', source_type: 'newspaper' },
};

const FILENAME_PATTERN = /^(\d{2})-(\d{2})-(\d{4})-(.+)\.pdf$/i;

export class FilenameContractError extends Error {}

export function parseDocumentMetadata(
  filePath: string,
  slugMap: SlugMap = SLUG_MAP,
): DocumentMetadata {
  const filename = path.basename(filePath);
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) {
    throw new FilenameContractError(
      `Filename "${filename}" does not match DD-MM-YYYY-<slug>.pdf`,
    );
  }
  const [, dd, mm, yyyy, slug] = match;
  const published_at = `${yyyy}-${mm}-${dd}`;
  if (Number.isNaN(Date.parse(published_at))) {
    throw new FilenameContractError(
      `Filename "${filename}" has an invalid date ${published_at}`,
    );
  }

  const slugConfig = slugMap[slug.toLowerCase()];
  if (!slugConfig) {
    throw new FilenameContractError(
      `Unknown slug "${slug}" in "${filename}" — no matching SlugConfig.`,
    );
  }

  return {
    source_type: slugConfig.source_type,
    edition_title: slugConfig.edition_title,
    edition_no: null,
    published_at,
    document_url: filename,
  };
}

const GERMAN_MONTHS = [
  'januar', 'februar', 'märz', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'dezember',
];

const PAGE_DATE_PATTERN = /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i;

export function extractDateFromPageOne(pageOneText: string): string | null {
  const match = PAGE_DATE_PATTERN.exec(pageOneText);
  if (!match) return null;
  const [, d, monthName, y] = match;
  const monthIdx = GERMAN_MONTHS.indexOf(monthName.toLowerCase());
  if (monthIdx < 0) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(Number(d)).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function checkDateAgainstPageOne(
  expected: string,
  pageOneText: string,
): { ok: true } | { ok: false; found: string } {
  const found = extractDateFromPageOne(pageOneText);
  if (!found) return { ok: true };
  if (found !== expected) return { ok: false, found };
  return { ok: true };
}

const GERMAN_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function germanFormatDate(iso: string): string {
  return GERMAN_FORMATTER.format(new Date(`${iso}T00:00:00Z`));
}
