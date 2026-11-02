import type { TextEncoding, TextRow } from '../shared/protocol';
import type { CodeSegment } from '../../../ui/syntax';
import {
  rowBreaksAt,
  wrapIndent,
  wrapStarts,
  type RowBreak,
} from '../../../ui/wordWrap';
import type { FindMark } from './findMarks';

export interface ScreenRow {
  readonly start: number;
  readonly end: number;
  readonly row: TextRow;
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly indent: number;
  readonly breakAt: number | undefined;
  readonly hanging: RowBreak['blanks'];
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function bytesOf(text: string, encoding: TextEncoding): number {
  switch (encoding) {
    case 'utf-8':
      return utf8Bytes(text);
    case 'utf-16le':
    case 'utf-16be':
      return text.length * 2;
    default:
      return text.length;
  }
}

function rowsOf(
  row: TextRow,
  index: number,
  columns: number | undefined,
  encoding: TextEncoding,
  continued: boolean,
): ScreenRow[] {
  const { text } = row;
  const indent =
    columns === undefined || continued ? 0 : wrapIndent(text, columns);
  const starts =
    columns === undefined ? [0] : wrapStarts(text, columns, indent);
  const breaks =
    columns === undefined || (starts.length === 1 && row.cut !== true)
      ? []
      : rowBreaksAt(
          text,
          row.cut === true ? [...starts, text.length] : starts,
          columns - 1,
          undefined,
          indent,
        );
  let start = row.start;
  return starts.map((from, part) => {
    const to = starts[part + 1] ?? text.length;
    const last = part === starts.length - 1;
    const end = last
      ? row.end
      : Math.min(row.end, start + bytesOf(text.slice(from, to), encoding));
    const shown: ScreenRow = {
      start,
      end,
      row,
      index,
      from,
      to,
      indent: part === 0 ? 0 : indent,
      breakAt: breaks[part]?.end,
      hanging: breaks[part]?.blanks ?? [],
    };
    start = end;
    return shown;
  });
}

export function screenRows(
  rows: readonly TextRow[],
  columns: number | undefined,
  encoding: TextEncoding,
): ScreenRow[] {
  return rows.flatMap((row, index) =>
    rowsOf(row, index, columns, encoding, rows[index - 1]?.cut === true),
  );
}

export function firstOf(rows: readonly ScreenRow[], index: number): number {
  const first = rows.findIndex((row) => row.index >= index);
  return first === -1 ? rows.length : first;
}

function lastFrom(
  rows: readonly ScreenRow[],
  first: number,
  reached: (row: ScreenRow) => boolean,
): number {
  const index = rows[first]?.index;
  let at = first;
  for (
    let next = rows[at + 1];
    next !== undefined && next.index === index && reached(next);
    next = rows[at + 1]
  ) {
    at++;
  }
  return at;
}

export function rowWithChar(
  rows: readonly ScreenRow[],
  first: number,
  char: number,
): number {
  return lastFrom(rows, first, (row) => row.from <= char);
}

export function rowWithByte(
  rows: readonly ScreenRow[],
  first: number,
  byte: number,
): number {
  return lastFrom(rows, first, (row) => row.start <= byte);
}

export function piecesWithin(
  pieces: readonly CodeSegment[],
  from: number,
  to: number,
): CodeSegment[] {
  const within: CodeSegment[] = [];
  let at = 0;
  for (const piece of pieces) {
    const end = at + piece.text.length;
    if (end > from && at < to) {
      within.push({
        ...piece,
        text: piece.text.slice(Math.max(0, from - at), to - at),
      });
    }
    at = end;
  }
  return within;
}

export function marksWithin(
  marks: readonly FindMark[],
  from: number,
  to: number,
): FindMark[] {
  return marks
    .filter((mark) => mark.end > from && mark.start < to)
    .map((mark) => ({
      start: Math.max(mark.start, from) - from,
      end: Math.min(mark.end, to) - from,
      current: mark.current,
    }));
}
