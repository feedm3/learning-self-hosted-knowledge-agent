import {
  estimateTokens,
  packParagraphs,
  TARGET_TOKENS,
  type Chunk,
} from '../mastra/lib/chunker';
import type { ExtractedPage, Section } from './extract-html';

export function buildWebsitePrefix(
  documentTitle: string,
  headingPath: string[],
  url: string,
): string {
  const trail = [documentTitle, ...headingPath].join(' › ');
  return `[${trail} – ${url}]`;
}

interface Group {
  headingPath: string[];
  paragraphs: string[];
}

// Packs consecutive sections together up to the target size, but never merges
// across an h1 boundary. A section that is already large stands alone and gets
// split downstream.
function groupSections(sections: Section[]): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let currentTokens = 0;

  for (const section of sections) {
    const sectionTokens = section.paragraphs.reduce(
      (sum, p) => sum + estimateTokens(p),
      0,
    );
    const sameH1 = current?.headingPath[0] === section.headingPath[0];
    const fits = current !== null && currentTokens + sectionTokens <= TARGET_TOKENS;

    if (current !== null && sameH1 && fits) {
      current.paragraphs.push(...section.paragraphs);
      currentTokens += sectionTokens;
    } else {
      current = {
        headingPath: section.headingPath,
        paragraphs: [...section.paragraphs],
      };
      groups.push(current);
      currentTokens = sectionTokens;
    }
  }
  return groups;
}

export function chunkHtmlPage(page: ExtractedPage): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const group of groupSections(page.sections)) {
    const prefix = buildWebsitePrefix(
      page.documentTitle,
      group.headingPath,
      page.url,
    );
    for (const body of packParagraphs(group.paragraphs)) {
      chunks.push({
        text: `${prefix}\n${body}`,
        chunk_index: chunkIndex,
        page_number: null,
        source_type: 'website',
        published_at: page.publishedAt,
        edition_no: null,
        document_title: page.documentTitle,
        document_url: page.url,
      });
      chunkIndex += 1;
    }
  }
  return chunks;
}
