import { drawnTabSize } from './indent';
import {
  cellWidthsOf,
  widthsFor,
  withTabSize,
} from '../../../lib/page/textWidths';
import { type Line } from '@codemirror/state';
import type { EditorSurface } from './surface';
import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../../components/cells/page/lines';
import { currentCellTable } from '../../../lib/page/cellTable';
import type { TextWidths } from '../../../lib/page/textWidths';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import {
  cellsAt,
  columnIn,
  rowHolding,
} from '../../../components/cells/page/textPlaces';
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
        widths: withTabSize(
          cellWidthsOf(currentCellTable()),
          drawnTabSize(view.state),
        ),
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
    column:
      held === undefined ? 0 : columnIn(grid.widths, line.text, held, char),
  };
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
  const wide =
    held === undefined ? 1 : cellsAt(grid.widths, line.text, held, char);
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
