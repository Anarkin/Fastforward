import { graphemes } from '../../../lib/page/graphemes';
import { invisibleParts } from '../../../lib/page/invisibles';

export interface Glyph {
  readonly text: string;
  readonly cells: number;
  readonly kind?: string;
  readonly from: number;
  readonly to: number;
}

export interface TextRow {
  readonly glyphs: readonly Glyph[];
  readonly from: number;
  readonly to: number;
  readonly wraps: boolean;
}

export interface Place {
  readonly row: number;
  readonly column: number;
}

export const signKind = 'sign';

const sign = '¤';

const lineBreaks = /\r\n|\r|\n/g;

const tabSize = 4;

function glyphsOf(
  cluster: string,
  from: number,
  column: number,
  cellsOf: (cluster: string) => number,
): Glyph[] {
  const to = from + cluster.length;
  if (cluster === '\t') {
    return Array.from({ length: tabSize - (column % tabSize) }, () => ({
      text: ' ',
      cells: 1,
      from,
      to,
    }));
  }
  const parts = invisibleParts(cluster);
  if (parts !== undefined) {
    let at = from;
    return parts.map((part) => {
      const start = at;
      at += part.text.length;
      return part.hidden
        ? { text: sign, cells: 1, kind: signKind, from: start, to: at }
        : {
            text: part.text,
            cells: Math.max(1, cellsOf(part.text)),
            from: start,
            to: at,
          };
    });
  }
  return [{ text: cluster, cells: Math.max(1, cellsOf(cluster)), from, to }];
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
  start: number,
  columns: number,
  cellsOf: (cluster: string) => number,
  most: number,
): Glyph[][] {
  const rows: Glyph[][] = [];
  let row: Glyph[] = [];
  let afterSpace = -1;
  let wrapping = false;
  for (const { segment, index } of graphemes.segment(line)) {
    for (const glyph of glyphsOf(
      segment,
      start + index,
      widthOf(row),
      cellsOf,
    )) {
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
          return rows;
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
  return rows;
}

function placed(rows: Glyph[][], start: number, end: number): TextRow[] {
  let from = start;
  return rows.map((glyphs, index) => {
    const next = rows[index + 1];
    const to = next === undefined ? end : (next[0]?.from ?? end);
    const row = { glyphs, from, to, wraps: next !== undefined };
    from = to;
    return row;
  });
}

export function laidOut(
  text: string,
  columns: number,
  most: number,
  cellsOf: (cluster: string) => number,
): TextRow[] {
  const rows: TextRow[] = [];
  if (columns <= 0 || most <= 0) {
    return rows;
  }
  let start = 0;
  for (const found of [...text.matchAll(lineBreaks), undefined]) {
    if (rows.length >= most) {
      break;
    }
    const end = found?.index ?? text.length;
    rows.push(
      ...placed(
        wrapped(
          text.slice(start, end),
          start,
          columns,
          cellsOf,
          most - rows.length,
        ),
        start,
        end,
      ),
    );
    start = end + (found?.[0].length ?? 0);
  }
  return rows.slice(0, most);
}

export function textRows(
  text: string,
  columns: number,
  most: number,
  cellsOf: (cluster: string) => number,
): (readonly Glyph[])[] {
  return laidOut(text, columns, most, cellsOf).map((row) => row.glyphs);
}

const lastEnd = (row: TextRow): number => row.glyphs.at(-1)?.to ?? row.from;

export function placeOf(
  rows: readonly TextRow[],
  offset: number,
  columns: number,
): Place | undefined {
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (row === undefined || offset < row.from || offset > row.to) {
      continue;
    }
    let column = 0;
    let last = row.from;
    for (const glyph of row.glyphs) {
      if (glyph.to > offset) {
        break;
      }
      column += glyph.cells;
      last = glyph.to;
    }
    return {
      row: index,
      column: Math.min(columns, column + Math.max(0, offset - last)),
    };
  }
  return undefined;
}

export function offsetAt(
  rows: readonly TextRow[],
  { row, column }: Place,
): number {
  const shown = rows[Math.max(0, Math.min(rows.length - 1, row))];
  if (shown === undefined) {
    return 0;
  }
  let at = 0;
  for (const glyph of shown.glyphs) {
    if (column < at + glyph.cells) {
      return column - at < Math.ceil(glyph.cells / 2) ? glyph.from : glyph.to;
    }
    at += glyph.cells;
  }
  const end = lastEnd(shown);
  return shown.wraps
    ? Math.max(end, Math.min(end + (column - at), shown.to - 1))
    : shown.to;
}

export function rowEndOf(row: TextRow): number {
  return row.wraps ? lastEnd(row) : row.to;
}
