import {
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type Text,
} from '@codemirror/state';
import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../cells/page/lines';
import { charAt, columnIn, rowHolding } from '../../cells/page/textPlaces';
import { widthsFor, type TextWidths } from '../../../lib/page/textWidths';

export interface Wrapping {
  readonly columns: number | undefined;
  readonly widths: TextWidths | undefined;
}

export interface GridPlace {
  readonly line: Line;
  readonly rows: readonly ScreenRow[];
  readonly row: number;
  readonly column: number;
}

const mostLinesKept = 256;

const linesKept = new Map<number, TextLine>();

function keptLine({ number, text }: Pick<Line, 'number' | 'text'>): TextLine {
  const known = linesKept.get(number);
  if (known?.text === text) {
    return known;
  }
  if (linesKept.size >= mostLinesKept) {
    linesKept.clear();
  }
  const line = { start: number, end: number + 1, text };
  linesKept.set(number, line);
  return line;
}

export function rowsOf(
  { columns, widths }: Wrapping,
  line: Pick<Line, 'number' | 'text'>,
): readonly ScreenRow[] {
  return wrappedRows(keptLine(line), columns, widthsFor(line.text, widths));
}

export function placeOf(
  grid: Wrapping,
  line: Line,
  pos: number,
  assoc: number,
): GridPlace {
  const rows = rowsOf(grid, line);
  const char = pos - line.from;
  const row = rowHolding(rows, char, assoc);
  const held = rows[row];
  return {
    line,
    rows,
    row,
    column:
      held === undefined ? 0 : columnIn(grid.widths, line.text, held, char),
  };
}

const assocOf = (range: SelectionRange) => range.assoc || 1;

export function movedRows(
  doc: Text,
  grid: Wrapping,
  range: SelectionRange,
  by: number,
): SelectionRange {
  let line = doc.lineAt(range.head);
  const from = placeOf(grid, line, range.head, assocOf(range));
  const goal = range.goalColumn ?? from.column;
  let { rows } = from;
  let row = from.row + by;
  while (row < 0 && line.number > 1) {
    line = doc.line(line.number - 1);
    rows = rowsOf(grid, line);
    row += rows.length;
  }
  while (row >= rows.length && line.number < doc.lines) {
    row -= rows.length;
    line = doc.line(line.number + 1);
    rows = rowsOf(grid, line);
  }
  if (row < 0) {
    return EditorSelection.cursor(0, 1, undefined, goal);
  }
  const target = rows[row];
  if (target === undefined) {
    return EditorSelection.cursor(doc.length, 1, undefined, goal);
  }
  const char = charAt(grid.widths, line.text, target, goal);
  return EditorSelection.cursor(
    line.from + char,
    char === target.to && row < rows.length - 1 ? -1 : 1,
    undefined,
    goal,
  );
}

export function cursorsOnLines(
  doc: Text,
  grid: Wrapping,
  selection: EditorSelection,
  by: number,
): EditorSelection | undefined {
  const ranges = [...selection.ranges];
  for (const range of selection.ranges) {
    const line = doc.lineAt(range.head);
    if (line.number === (by > 0 ? doc.lines : 1)) {
      continue;
    }
    const { rows, row } = placeOf(grid, line, range.head, assocOf(range));
    const added = movedRows(
      doc,
      grid,
      range,
      by > 0 ? rows.length - row : -(row + 1),
    );
    if (!ranges.some(({ head }) => head === added.head)) {
      ranges.push(added);
    }
  }
  return ranges.length === selection.ranges.length
    ? undefined
    : EditorSelection.create(ranges, ranges.length - 1);
}

export function rowStart(
  doc: Text,
  grid: Wrapping,
  range: SelectionRange,
): SelectionRange {
  const line = doc.lineAt(range.head);
  const { rows, row } = placeOf(grid, line, range.head, assocOf(range));
  return EditorSelection.cursor(line.from + (rows[row]?.from ?? 0), 1);
}

export function rowEnd(
  doc: Text,
  grid: Wrapping,
  range: SelectionRange,
): SelectionRange {
  const line = doc.lineAt(range.head);
  const { rows, row } = placeOf(grid, line, range.head, assocOf(range));
  const last = row >= rows.length - 1;
  return EditorSelection.cursor(
    line.from + (last ? line.length : (rows[row]?.to ?? line.length)),
    last ? 1 : -1,
  );
}

export function extended(
  range: SelectionRange,
  moved: SelectionRange,
): SelectionRange {
  return EditorSelection.range(
    range.anchor,
    moved.head,
    moved.goalColumn,
    moved.bidiLevel ?? undefined,
    moved.assoc,
  );
}

export function selectionMoved(
  state: EditorState,
  selects: boolean,
  move: (range: SelectionRange) => SelectionRange,
): EditorSelection {
  const { selection } = state;
  return EditorSelection.create(
    selection.ranges.map((range) => {
      const reached = move(range);
      return selects ? extended(range, reached) : reached;
    }),
    selection.mainIndex,
  );
}

export const rowMoved = (
  state: EditorState,
  wrapping: Wrapping,
  forward: boolean,
  selects: boolean,
): EditorSelection =>
  selectionMoved(state, selects, (range) =>
    !selects && !range.empty
      ? EditorSelection.cursor(forward ? range.to : range.from)
      : movedRows(state.doc, wrapping, range, forward ? 1 : -1),
  );

export const rowEdgeMoved = (
  state: EditorState,
  wrapping: Wrapping,
  end: boolean,
  selects: boolean,
): EditorSelection =>
  selectionMoved(state, selects, (range) =>
    (end ? rowEnd : rowStart)(state.doc, wrapping, range),
  );
