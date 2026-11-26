import {
  EditorSelection,
  type SelectionRange,
  type Text,
} from '@codemirror/state';
import { placeOf, rowsOf, type Grid } from './grid';
import { charAt } from '../../../components/cells/page/textPlaces';

type Wrapping = Pick<Grid, 'columns' | 'widths'>;

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
