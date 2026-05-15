import { readFile } from 'node:fs/promises';
import { extractTextItems, getDocumentProxy, type StructuredTextItem } from 'unpdf';

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  hasEOL: boolean;
}

export interface ParsedPage {
  page_number: number;
  items: TextItem[];
}

export interface ParsedDocument {
  pages: ParsedPage[];
}

export async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const buffer = await readFile(filePath);
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const { items: itemsPerPage } = await extractTextItems(pdf);

  const pages: ParsedPage[] = itemsPerPage.map((items, i) => ({
    page_number: i + 1,
    items: items.map(toTextItem).filter((it) => it.text.length > 0),
  }));
  return { pages };
}

function toTextItem(raw: StructuredTextItem): TextItem {
  return {
    text: raw.str,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    fontSize: raw.fontSize,
    hasEOL: raw.hasEOL,
  };
}
