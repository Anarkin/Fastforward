import { tabSizeField } from './indent';
import { widthsFor } from '../../../lib/page/textWidths';
import { clusterBreak } from '../../../lib/page/graphemes';
import { type Line } from '@codemirror/state';
import type { EditorSurface } from './surface';
import { charAtColumn, columnAt } from '../../../components/cells/page/columns';
import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../../components/cells/page/lines';
import { cellsOf } from '../../../lib/page/cellTable';
import type { TextWidths } from '../../../lib/page/textWidths';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import { textAdvance, textLeft, wrapColumnsOf } from './rows';

export interface Grid {
  readonly advance: number;
  readonly rowHeight: number;
  readonly left: number;
  readonly columns: number | undefined;
  readonly widths: TextWidths | undefined;
}

export interface GridCell {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface GridPlace {
  readonly line: Line;
  readonly rows: readonly ScreenRow[];
  readonly row: number;
  readonly column: number;
}

const cellWidths = new Map<number | undefined, TextWidths>();

function cellWidthsOf(tabSize: number | undefined): TextWidths {
  let widths = cellWidths.get(tabSize);
  if (widths === undefined) {
    widths = {
      char: 1,
      of: (cluster) => cellsOf(cluster),
      ...(tabSize !== undefined && { tabSize }),
    };
    cellWidths.set(tabSize, widths);
  }
  return widths;
}

export function gridOf(view: EditorSurface): Grid | undefined {
  if (!view.contentDOM.isConnected) {
    return undefined;
  }
  const advance = textAdvance(view);
  const rowHeight = lineHeightOf(view.contentDOM, 0, devicePixelRatio);
  return advance > 0 && rowHeight > 0
    ? {
        advance,
        rowHeight,
        left: textLeft(view),
        columns: view.lineWrapping ? wrapColumnsOf(view) : undefined,
        widths: cellWidthsOf(view.state.field(tabSizeField, false)),
      }
    : undefined;
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
  { columns, widths }: Pick<Grid, 'columns' | 'widths'>,
  line: Pick<Line, 'number' | 'text'>,
): readonly ScreenRow[] {
  return wrappedRows(keptLine(line), columns, widthsFor(line.text, widths));
}

export function rowHolding(
  rows: readonly ScreenRow[],
  char: number,
  assoc: number,
): number {
  let found = 0;
  for (const [index, row] of rows.entries()) {
    if (char > row.from || (char === row.from && (assoc >= 0 || index === 0))) {
      found = index;
    }
  }
  return found;
}

export function columnIn(
  { widths }: Pick<Grid, 'widths'>,
  text: string,
  row: ScreenRow,
  char: number,
): number {
  return (
    row.indent +
    columnAt(
      text,
      Math.min(char, text.length),
      row.from,
      widthsFor(text, widths),
    )
  );
}

export function placeOf(
  grid: Pick<Grid, 'columns' | 'widths'>,
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
    column: held === undefined ? 0 : columnIn(grid, line.text, held, char),
  };
}

export function charAt(
  { widths }: Pick<Grid, 'widths'>,
  text: string,
  row: ScreenRow,
  column: number,
): number {
  return charAtColumn(
    text,
    row.from,
    row.to,
    row.indent,
    column,
    widthsFor(text, widths),
  );
}

export function cellAt(
  view: EditorSurface,
  grid: Grid,
  pos: number,
  assoc: number,
): GridCell {
  const line = view.state.doc.lineAt(pos);
  const { rows, row, column } = placeOf(grid, line, pos, assoc);
  const held = rows[row];
  const char = pos - line.from;
  const next =
    held === undefined || char >= held.to
      ? char
      : clusterBreak(line.text, char, true);
  const wide =
    held === undefined || next <= char
      ? 1
      : Math.max(1, columnIn(grid, line.text, held, next) - column);
  const kept =
    grid.columns === undefined ? column : Math.min(column, grid.columns);
  return {
    left: grid.left + kept * grid.advance,
    top:
      view.documentTop + view.lineBlockAt(line.from).top + row * grid.rowHeight,
    width: (kept < column ? 1 : wide) * grid.advance,
    height: grid.rowHeight,
  };
}
