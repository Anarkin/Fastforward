import type { TextRow } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { CodeSegment } from './codeSegments';
import { rowBreaksAt, type RowBreak } from '../../../lib/page/rowBreaks';
import { wrapIndent, wrapStarts } from '../../../lib/page/wordWrap';
import type { FindMark } from './markPieces';
import { bytesOf } from './encodedBytes';
import { columnsOf } from '../../../lib/page/textColumns';
import { type TextWidths } from '../../../lib/page/textWidths';

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

interface Wrapping {
  readonly columns: number;
  readonly encoding: TextEncoding;
  readonly widths: TextWidths | undefined;
  readonly continued: boolean;
  readonly cut: boolean;
  readonly indent: number;
  readonly starts: readonly number[];
  readonly breaks: readonly RowBreak[];
  readonly sizes: readonly number[];
}

const mostCharacters = 1_000_000;

const wrappings = new Map<string, Wrapping[]>();

let characters = 0;

function wrappingOf(
  { text, cut }: TextRow,
  columns: number,
  encoding: TextEncoding,
  continued: boolean,
  widths: TextWidths | undefined,
): Wrapping {
  const ways = wrappings.get(text) ?? [];
  let found = ways.find(
    (one) =>
      one.columns === columns &&
      one.encoding === encoding &&
      one.widths === widths &&
      one.continued === continued &&
      one.cut === (cut === true),
  );
  if (found === undefined) {
    const indent = continued ? 0 : wrapIndent(text, columns);
    const starts = wrapStarts(text, columns, indent, widths);
    found = {
      columns,
      encoding,
      widths,
      continued,
      cut: cut === true,
      indent,
      starts,
      breaks:
        starts.length === 1 && cut !== true
          ? []
          : rowBreaksAt(
              text,
              cut === true ? [...starts, text.length] : starts,
              columns,
              widths && ((part: string) => columnsOf(part, widths)),
              indent,
            ),
      sizes: starts
        .slice(0, -1)
        .map((from, part) => bytesOf(text, from, starts[part + 1], encoding)),
    };
    ways.push(found);
    characters += text.length;
  }
  wrappings.delete(text);
  wrappings.set(text, ways);
  for (const [oldest, old] of wrappings) {
    if (characters <= mostCharacters || oldest === text) {
      break;
    }
    wrappings.delete(oldest);
    characters -= oldest.length * old.length;
  }
  return found;
}

const unwrapped = { indent: 0, starts: [0], breaks: [], sizes: [] };

function rowsOf(
  row: TextRow,
  index: number,
  columns: number | undefined,
  encoding: TextEncoding,
  continued: boolean,
  widths: TextWidths | undefined,
): ScreenRow[] {
  const { text } = row;
  const { indent, starts, breaks, sizes } =
    columns === undefined
      ? unwrapped
      : wrappingOf(row, columns, encoding, continued, widths);
  let start = row.start;
  return starts.map((from, part) => {
    const to = starts[part + 1] ?? text.length;
    const last = part === starts.length - 1;
    const end = last ? row.end : Math.min(row.end, start + (sizes[part] ?? 0));
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

export function partOfRow(
  rows: readonly ScreenRow[],
  index: number,
  byte: number,
): number {
  const row = rows[index];
  const next = rows[index + 1];
  if (row === undefined || next === undefined || next.start <= row.start) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(1, (byte - row.start) / (next.start - row.start)),
  );
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
      ...mark,
      start: Math.max(mark.start, from) - from,
      end: Math.min(mark.end, to) - from,
    }));
}
