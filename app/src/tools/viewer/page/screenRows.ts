import type { TextRow } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { rowBreaksAt, type RowBreak } from '../../../lib/page/rowBreaks';
import { wrapIndent, wrapStarts } from '../../../lib/page/wordWrap';
import type { ScreenRow } from '../../../components/cells/page/lines';
import { bytesOf } from './encodedBytes';
import { columnsAlong } from '../../../components/cells/page/columns';
import { type TextWidths } from '../../../lib/page/textWidths';
import { onceAText } from '../../../lib/page/onceAText';

interface Wrapping {
  readonly indent: number;
  readonly starts: readonly number[];
  readonly breaks: readonly RowBreak[];
  readonly sizes: readonly number[];
}

const wrappingWays = onceAText(
  (
    text: string,
    columns: number,
    encoding: TextEncoding,
    continued: boolean,
    widths: TextWidths | undefined,
    cut: boolean,
  ): Wrapping => {
    const indent = continued ? 0 : wrapIndent(text, columns);
    const starts = wrapStarts(text, columns, indent, widths);
    return {
      indent,
      starts,
      breaks:
        starts.length === 1 && !cut
          ? []
          : rowBreaksAt(
              text,
              cut ? [...starts, text.length] : starts,
              columns,
              widths && ((part: string) => columnsAlong(part, widths)),
              indent,
            ),
      sizes: starts
        .slice(0, -1)
        .map((from, part) => bytesOf(text, from, starts[part + 1], encoding)),
    };
  },
);

const wrappingOf = (
  { text, cut }: TextRow,
  columns: number,
  encoding: TextEncoding,
  continued: boolean,
  widths: TextWidths | undefined,
): Wrapping =>
  wrappingWays(text, columns, encoding, continued, widths, cut === true);

const unwrapped = { indent: 0, starts: [0], breaks: [], sizes: [] };

export type ViewerRow = ScreenRow & { readonly opensText?: true };

function rowsOf(
  row: TextRow,
  index: number,
  columns: number | undefined,
  encoding: TextEncoding,
  continued: boolean,
  widths: TextWidths | undefined,
): ViewerRow[] {
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
    const shown: ViewerRow = {
      ...(part === 0 && row.opensText === true && { opensText: true }),
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
    readonly shown: ViewerRow[];
  }
>();

export function screenRows(
  rows: readonly TextRow[],
  columns: number | undefined,
  encoding: TextEncoding,
  widths?: TextWidths,
): ViewerRow[] {
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
