import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../../components/cells/page/lines';
import {
  cellsAt,
  charAt,
  columnIn,
  endingSignsOf,
  rowHolding,
  underAt,
} from '../../../components/cells/page/textPlaces';
import {
  lineAt,
  wordAt,
  type TextPlace,
} from '../../../components/cells/page/textSelection';
import { widthsFor, type TextWidths } from '../../../lib/page/textWidths';

export interface Place {
  readonly row: number;
  readonly column: number;
}

export interface CaretCell extends Place {
  readonly cells: number;
  readonly under: string;
}

const lineBreaks = /\r\n|\r|\n/g;

export function linesOf(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (const found of [...text.matchAll(lineBreaks), undefined]) {
    const end = found?.index ?? text.length;
    const ending = found?.[0];
    lines.push({
      start,
      end: end + (ending?.length ?? 0),
      text: text.slice(start, end),
      ...(ending !== undefined && { ending: endingSignsOf(ending) }),
    });
    start = end + (ending?.length ?? 0);
  }
  return lines;
}

export function rowsOf(
  text: string,
  wrapAt: number | undefined,
  widths: TextWidths | undefined,
): ScreenRow[] {
  return linesOf(text).flatMap((line) =>
    wrappedRows(line, wrapAt, widthsFor(line.text, widths)),
  );
}

const holds = (line: TextLine, offset: number) =>
  offset >= line.start && offset <= line.start + line.text.length;

export function textPlaceOf(
  rows: readonly ScreenRow[],
  offset: number,
): TextPlace | undefined {
  const line = rows.find(({ row }) => holds(row, offset))?.row;
  return line === undefined
    ? undefined
    : { start: line.start, char: offset - line.start };
}

export function placeOf(
  rows: readonly ScreenRow[],
  offset: number,
  widths: TextWidths | undefined,
  assoc = 1,
): CaretCell | undefined {
  const first = rows.findIndex(({ row }) => holds(row, offset));
  const line = rows[first]?.row;
  if (line === undefined) {
    return undefined;
  }
  const lineRows = rows.filter(({ row }) => row === line);
  const char = offset - line.start;
  const local = rowHolding(lineRows, char, assoc);
  const held = lineRows[local];
  if (held === undefined) {
    return undefined;
  }
  return {
    row: first + local,
    column: columnIn(widths, line.text, held, char),
    cells: cellsAt(widths, line.text, held, char),
    under: underAt(line.text, char),
  };
}

export function offsetAt(
  rows: readonly ScreenRow[],
  { row, column }: Place,
  widths: TextWidths | undefined,
): number {
  const shown = rows[Math.max(0, Math.min(rows.length - 1, row))];
  return shown === undefined
    ? 0
    : shown.row.start +
        charAt(widths, shown.row.text, shown, Math.max(0, column));
}

export interface Span {
  readonly anchor: number;
  readonly head: number;
}

export function spanAt(
  rows: readonly ScreenRow[],
  offset: number,
  whole: 'word' | 'line',
): Span | undefined {
  const line = rows.find(({ row }) => holds(row, offset))?.row;
  if (line === undefined) {
    return undefined;
  }
  const { anchor, focus } =
    whole === 'word' ? wordAt(line, offset - line.start) : lineAt(line);
  return { anchor: line.start + anchor.char, head: line.start + focus.char };
}
