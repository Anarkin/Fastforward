import { graphemes } from '../../../lib/page/graphemes';
import { invisibleParts } from '../../../lib/page/invisibles';

export interface Glyph {
  readonly text: string;
  readonly cells: number;
  readonly kind?: string;
}

export const signKind = 'sign';

const sign = '¤';

const lineBreaks = /\r\n|\r|\n/;

const tabSize = 4;

function glyphsOf(
  cluster: string,
  column: number,
  cellsOf: (cluster: string) => number,
): Glyph[] {
  if (cluster === '\t') {
    return Array.from({ length: tabSize - (column % tabSize) }, () => ({
      text: ' ',
      cells: 1,
    }));
  }
  const parts = invisibleParts(cluster);
  if (parts !== undefined) {
    return parts.map((part) =>
      part.hidden
        ? { text: sign, cells: 1, kind: signKind }
        : { text: part.text, cells: Math.max(1, cellsOf(part.text)) },
    );
  }
  return [{ text: cluster, cells: Math.max(1, cellsOf(cluster)) }];
}

const widthOf = (row: readonly Glyph[]) =>
  row.reduce((cells, glyph) => cells + glyph.cells, 0);

function hung(row: Glyph[]): Glyph[] {
  let end = row.length;
  while (end > 0 && row[end - 1]?.text === ' ') {
    end--;
  }
  return row.slice(0, end);
}

function wrapped(
  line: string,
  columns: number,
  cellsOf: (cluster: string) => number,
  rows: Glyph[][],
  most: number,
): void {
  let row: Glyph[] = [];
  let afterSpace = -1;
  let wrapping = false;
  for (const { segment } of graphemes.segment(line)) {
    for (const glyph of glyphsOf(segment, widthOf(row), cellsOf)) {
      const blank = glyph.text === ' ';
      if (blank && wrapping) {
        continue;
      }
      const over = widthOf(row) + glyph.cells > columns;
      if (over && (blank || row.length > 0)) {
        const breaks = !blank && afterSpace > 0 && afterSpace < row.length;
        rows.push(hung(breaks ? row.slice(0, afterSpace) : row));
        row = breaks ? row.slice(afterSpace) : [];
        afterSpace = -1;
        wrapping = blank;
        if (rows.length >= most) {
          return;
        }
        if (blank) {
          continue;
        }
      }
      row.push(glyph);
      wrapping = false;
      if (blank) {
        afterSpace = row.length;
      }
    }
  }
  rows.push(row);
}

export function textRows(
  text: string,
  columns: number,
  most: number,
  cellsOf: (cluster: string) => number,
): Glyph[][] {
  const rows: Glyph[][] = [];
  if (columns <= 0 || most <= 0) {
    return rows;
  }
  for (const line of text.split(lineBreaks)) {
    if (rows.length >= most) {
      break;
    }
    wrapped(line, columns, cellsOf, rows, most);
  }
  return rows.slice(0, most);
}
