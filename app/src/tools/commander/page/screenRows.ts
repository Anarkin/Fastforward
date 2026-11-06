import type { TextEncoding, TextRow } from '../shared/protocol';
import type { CodeSegment } from '../../../ui/syntax';
import {
  rowBreaksAt,
  wrapIndent,
  wrapStarts,
  type RowBreak,
} from '../../../ui/wordWrap';
import type { FindMark } from './findMarks';
import { columnsOf, type TextWidths } from '../../../ui/textWidths';

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

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

function utf8Bytes(text: string, from: number, to: number): number {
  let bytes = 0;
  for (let at = from; at < to; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (isHigh(code) && at + 1 < to && isLow(text.charCodeAt(at + 1))) {
      bytes += 4;
      at++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function bytesOf(
  text: string,
  from: number,
  to: number,
  encoding: TextEncoding,
): number {
  switch (encoding) {
    case 'utf-8':
      return utf8Bytes(text, from, to);
    case 'utf-16le':
    case 'utf-16be':
      return (to - from) * 2;
    default:
      return to - from;
  }
}

function rowsOf(
  row: TextRow,
  index: number,
  columns: number | undefined,
  encoding: TextEncoding,
  continued: boolean,
  widths: TextWidths | undefined,
): ScreenRow[] {
  const { text } = row;
  const indent =
    columns === undefined || continued ? 0 : wrapIndent(text, columns);
  const starts =
    columns === undefined ? [0] : wrapStarts(text, columns, indent, widths);
  const breaks =
    columns === undefined || (starts.length === 1 && row.cut !== true)
      ? []
      : rowBreaksAt(
          text,
          row.cut === true ? [...starts, text.length] : starts,
          columns,
          widths && ((part: string) => columnsOf(part, widths)),
          indent,
        );
  let start = row.start;
  return starts.map((from, part) => {
    const to = starts[part + 1] ?? text.length;
    const last = part === starts.length - 1;
    const end = last
      ? row.end
      : Math.min(row.end, start + bytesOf(text, from, to, encoding));
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

const wrapped = new WeakMap<
  readonly TextRow[],
  {
    readonly columns: number | undefined;
    readonly encoding: TextEncoding;
    readonly widths: TextWidths | undefined;
    readonly shown: ScreenRow[];
  }
>();

export function screenRows(
  rows: readonly TextRow[],
  columns: number | undefined,
  encoding: TextEncoding,
  widths?: TextWidths,
): ScreenRow[] {
  const known = wrapped.get(rows);
  if (
    known !== undefined &&
    known.columns === columns &&
    known.encoding === encoding &&
    known.widths === widths
  ) {
    return known.shown;
  }
  const shown = rows.flatMap((row, index) =>
    rowsOf(
      row,
      index,
      columns,
      encoding,
      rows[index - 1]?.cut === true,
      widths,
    ),
  );
  wrapped.set(rows, { columns, encoding, widths, shown });
  return shown;
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
