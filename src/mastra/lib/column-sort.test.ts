import { describe, expect, it } from 'vitest';
import { orderPage } from './column-sort';
import type { ParsedPage, TextItem } from './pdf-parser';

function item(text: string, x: number, y: number): TextItem {
  return { text, x, y, width: 10, height: 10, fontSize: 10, hasEOL: false };
}

function page(items: TextItem[]): ParsedPage {
  return { page_number: 1, items };
}

describe('orderPage', () => {
  it('returns no paragraphs for an empty page', () => {
    expect(orderPage(page([]))).toEqual({ page_number: 1, paragraphs: [] });
  });

  it('orders a single column top-to-bottom regardless of input order', () => {
    const items = [
      item('c', 50, 80),
      item('a', 50, 100),
      item('e', 50, 60),
      item('b', 50, 90),
      item('f', 50, 50),
      item('d', 50, 70),
    ];
    const { paragraphs } = orderPage(page(items));
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe('a b c d e f');
  });

  it('reads the left column fully before the right column', () => {
    const items = [
      item('L1', 50, 100), item('L2', 50, 90), item('L3', 50, 80),
      item('L4', 50, 70), item('L5', 50, 60), item('L6', 50, 50),
      item('R1', 300, 100), item('R2', 300, 90), item('R3', 300, 80),
      item('R4', 300, 70), item('R5', 300, 60), item('R6', 300, 50),
    ];
    const { paragraphs } = orderPage(page(items));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe('L1 L2 L3 L4 L5 L6');
    expect(paragraphs[1].text).toBe('R1 R2 R3 R4 R5 R6');
  });

  it('splits paragraphs on a large vertical gap', () => {
    const items = [
      item('a', 50, 200), item('b', 50, 190), item('c', 50, 180),
      item('d', 50, 100), item('e', 50, 90), item('f', 50, 80),
    ];
    const { paragraphs } = orderPage(page(items));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe('a b c');
    expect(paragraphs[1].text).toBe('d e f');
  });

  it('records the largest font size seen in a paragraph', () => {
    const big = { ...item('Heading', 50, 100), fontSize: 24 };
    const small = item('body', 50, 95);
    const { paragraphs } = orderPage(page([big, small]));
    expect(paragraphs[0].fontSizeMax).toBe(24);
  });
});
