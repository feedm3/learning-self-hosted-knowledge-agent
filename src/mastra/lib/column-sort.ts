import type { ParsedPage, TextItem } from './pdf-parser';

export interface Paragraph {
  text: string;
  fontSizeMax: number;
}

export interface OrderedPage {
  page_number: number;
  paragraphs: Paragraph[];
}

interface Line {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  text: string;
}

const LINE_Y_TOLERANCE_RATIO = 0.5;
const COLUMN_BIN_WIDTH = 20;
const COLUMN_MIN_ITEMS = 6;
const COLUMN_MERGE_FACTOR = 3;
const PARAGRAPH_GAP_RATIO = 1.6;

export function orderPage(page: ParsedPage): OrderedPage {
  if (page.items.length === 0) return { page_number: page.page_number, paragraphs: [] };

  const columnStarts = detectColumnStarts(page.items);
  const itemsByColumn = assignItemsToColumns(page.items, columnStarts);

  const paragraphs: Paragraph[] = [];
  for (const colItems of itemsByColumn) {
    const lines = groupItemsIntoLines(colItems);
    lines.sort((a, b) => b.y - a.y);
    paragraphs.push(...joinIntoParagraphs(lines));
  }
  return { page_number: page.page_number, paragraphs };
}

function detectColumnStarts(items: TextItem[]): number[] {
  const bins = new Map<number, number>();
  for (const item of items) {
    const bin = Math.round(item.x / COLUMN_BIN_WIDTH) * COLUMN_BIN_WIDTH;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const candidates = [...bins.entries()]
    .filter(([, count]) => count >= COLUMN_MIN_ITEMS)
    .map(([bin]) => bin)
    .sort((a, b) => a - b);

  if (candidates.length === 0) {
    return [Math.min(...items.map((i) => i.x))];
  }

  const merged: number[] = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i] - merged[merged.length - 1] > COLUMN_BIN_WIDTH * COLUMN_MERGE_FACTOR) {
      merged.push(candidates[i]);
    }
  }
  return merged;
}

function assignItemsToColumns(items: TextItem[], columnStarts: number[]): TextItem[][] {
  const buckets: TextItem[][] = columnStarts.map(() => []);
  const midpoints: number[] = [];
  for (let i = 0; i < columnStarts.length - 1; i++) {
    midpoints.push((columnStarts[i] + columnStarts[i + 1]) / 2);
  }
  midpoints.push(Number.POSITIVE_INFINITY);

  for (const item of items) {
    let idx = 0;
    while (idx < midpoints.length && item.x >= midpoints[idx]) idx++;
    buckets[Math.min(idx, columnStarts.length - 1)].push(item);
  }
  return buckets;
}

function groupItemsIntoLines(items: TextItem[]): Line[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines: Line[] = [];
  let bucket: TextItem[] = [];
  let bucketY = sorted[0].y;
  let bucketTol = sorted[0].height * LINE_Y_TOLERANCE_RATIO;

  for (const item of sorted) {
    if (bucket.length === 0 || Math.abs(item.y - bucketY) <= bucketTol) {
      bucket.push(item);
      bucketY = bucket.reduce((s, it) => s + it.y, 0) / bucket.length;
      bucketTol = Math.max(bucketTol, item.height * LINE_Y_TOLERANCE_RATIO);
    } else {
      lines.push(toLine(bucket));
      bucket = [item];
      bucketY = item.y;
      bucketTol = item.height * LINE_Y_TOLERANCE_RATIO;
    }
  }
  if (bucket.length > 0) lines.push(toLine(bucket));
  return lines;
}

function toLine(items: TextItem[]): Line {
  items.sort((a, b) => a.x - b.x);
  const parts: string[] = [];
  let lastRight = -Infinity;
  for (const it of items) {
    const space = parts.length > 0 && it.x - lastRight > it.fontSize * 0.2;
    if (space) parts.push(' ');
    parts.push(it.text);
    lastRight = it.x + it.width;
  }
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  return {
    x: items[0].x,
    y: items[0].y,
    width: items.reduce((max, it) => Math.max(max, it.x + it.width - items[0].x), 0),
    fontSize: items.reduce((max, it) => Math.max(max, it.fontSize), 0),
    text,
  };
}

function joinIntoParagraphs(lines: Line[]): Paragraph[] {
  if (lines.length === 0) return [];
  const paragraphs: Paragraph[] = [];
  let current: Line[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];
    const gap = prev.y - curr.y;
    const expectedLine = Math.max(prev.fontSize, curr.fontSize);
    if (gap > expectedLine * PARAGRAPH_GAP_RATIO) {
      paragraphs.push(flushParagraph(current));
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  if (current.length > 0) paragraphs.push(flushParagraph(current));
  return paragraphs;
}

function flushParagraph(lines: Line[]): Paragraph {
  const text = lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  const fontSizeMax = lines.reduce((max, l) => Math.max(max, l.fontSize), 0);
  return { text, fontSizeMax };
}
