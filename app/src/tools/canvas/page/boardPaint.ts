import type { NodeColors } from './nodeColors';
import type { CellTable } from '../../../lib/page/cellTable';
import type { Board } from '../shared/board';
import type { Gesture, Preview } from './gestures';
import type { Sides } from './hits';
import type { Origin } from './pan';
import { ghostId, placedSizes, previewed } from './placing';
import type { Cell } from './routes';
import type { Placing, Typing } from './state';
import type { BoardSurface, Drawn } from './surface';
import { markAt } from './wiring';

export interface Pressing {
  readonly pointer: number;
  readonly gesture: Gesture;
}

interface Painted {
  readonly board: Board;
  readonly table: CellTable;
  readonly origin: Origin | undefined;
  readonly selected: readonly string[];
  readonly placing: Placing | undefined;
  readonly preview: Preview | undefined;
  readonly ghostAt: Cell | undefined;
  readonly unit: Drawn['unit'] | undefined;
  readonly typing: Typing | undefined;
  readonly hover: Cell | undefined;
  readonly whitespace: boolean;
  readonly colors?: NodeColors | undefined;
  readonly titles?: ReadonlyMap<string, string> | undefined;
}

const noBoxes = new Map();

export function paint(
  surface: BoardSurface | undefined,
  {
    board,
    table,
    origin,
    selected,
    placing,
    preview,
    ghostAt,
    unit,
    typing,
    hover,
    whitespace,
    colors,
    titles,
  }: Painted,
): Drawn | undefined {
  const ghost =
    placing === undefined || ghostAt === undefined
      ? undefined
      : { type: placing, box: { ...ghostAt, ...placedSizes[placing] } };
  const wire = preview?.wire;
  const shown =
    unit !== undefined && (preview !== undefined || ghost !== undefined)
      ? previewed(board, unit, preview?.boxes ?? noBoxes, ghost, wire)
      : board;
  const mark =
    unit === undefined || hover === undefined
      ? undefined
      : markAt(board, unit, hover);
  return surface?.draw(shown, table, origin, {
    selected: new Set(
      ghost === undefined && wire === undefined
        ? selected
        : [...selected, ghostId],
    ),
    marquee: preview?.area,
    typing,
    whitespace,
    marks: mark === undefined ? [] : [mark.cell],
    colorsOf:
      colors === undefined ? undefined : (id, text) => colors.of(id, text),
    titles,
  });
}

export const hoverFrom = (
  placing: Placing | undefined,
  typing: Typing | undefined,
  pressing: Pressing | undefined,
  at: Cell | undefined,
): Cell | undefined =>
  placing === undefined &&
  typing === undefined &&
  (pressing === undefined || pressing.gesture.kind === 'connect')
    ? at
    : undefined;

export function cellAt(
  event: { readonly clientX: number; readonly clientY: number },
  known: Drawn,
): Cell {
  return {
    column: Math.floor(
      known.origin.column + (event.clientX - known.left) / known.cell.width,
    ),
    row: Math.floor(
      known.origin.row + (event.clientY - known.top) / known.cell.height,
    ),
  };
}

export function cursorOf(sides: Sides): string {
  if ((sides.left && sides.top) || (sides.right && sides.bottom)) {
    return 'nwse';
  }
  if ((sides.right && sides.top) || (sides.left && sides.bottom)) {
    return 'nesw';
  }
  return sides.left || sides.right ? 'ew' : 'ns';
}
