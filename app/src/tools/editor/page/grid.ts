import { drawnTabSize } from './indent';
import { cellWidthsOf, withTabSize } from '../../../lib/page/textWidths';
import type { EditorSurface } from './surface';
import { currentCellTable } from '../../../lib/page/cellTable';
import type { TextWidths } from '../../../lib/page/textWidths';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import { cellsAt } from '../../../components/cells/page/textPlaces';
import { placeOf } from '../../../components/editing/page/rowSteps';
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
