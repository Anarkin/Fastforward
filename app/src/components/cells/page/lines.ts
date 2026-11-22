import type { ColoredSegment } from '../../syntax/page/lineColors';
import { rowBreaksAt, type RowBreak } from '../../../lib/page/rowBreaks';
import { columnsOf } from '../../../lib/page/textColumns';
import type { TextWidths } from '../../../lib/page/textWidths';
import { wrapIndent, wrapStarts } from '../../../lib/page/wordWrap';
import type { FindMark } from './marks';

export interface TextLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly cut?: true;
}

export interface ScreenRow {
  readonly start: number;
  readonly end: number;
  readonly row: TextLine;
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly indent: number;
  readonly breakAt: number | undefined;
  readonly hanging: RowBreak['blanks'];
}

export function piecesWithin(
  pieces: readonly ColoredSegment[],
  from: number,
  to: number,
): ColoredSegment[] {
  const within: ColoredSegment[] = [];
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

interface Wrapped {
  readonly columns: number | undefined;
  readonly widths: TextWidths | undefined;
  readonly rows: readonly ScreenRow[];
}

const wrapped = new WeakMap<TextLine, Wrapped>();

export function wrappedRows(
  line: TextLine,
  columns: number | undefined,
  widths: TextWidths | undefined,
): readonly ScreenRow[] {
  const known = wrapped.get(line);
  if (
    known !== undefined &&
    known.columns === columns &&
    known.widths === widths
  ) {
    return known.rows;
  }
  const { text } = line;
  const whole: ScreenRow = {
    start: line.start,
    end: line.end,
    row: line,
    index: 0,
    from: 0,
    to: text.length,
    indent: 0,
    breakAt: undefined,
    hanging: [],
  };
  let rows: readonly ScreenRow[] = [whole];
  if (columns !== undefined) {
    const indent = wrapIndent(text, columns);
    const starts = wrapStarts(text, columns, indent, widths);
    if (starts.length > 1) {
      const breaks = rowBreaksAt(
        text,
        starts,
        columns,
        widths && ((part: string) => columnsOf(part, widths)),
        indent,
      );
      rows = starts.map((from, part) => ({
        ...whole,
        from,
        to: starts[part + 1] ?? text.length,
        indent: part === 0 ? 0 : indent,
        breakAt: breaks[part]?.end,
        hanging: breaks[part]?.blanks ?? [],
      }));
    }
  }
  wrapped.set(line, { columns, widths, rows });
  return rows;
}
