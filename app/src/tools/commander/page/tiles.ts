import type { ListMove, VisibleRows } from '../../../ui/listMoves';

export type GridMove = ListMove | 'left' | 'right';

const tilePadding = 8;

export function tileWidthOf(thumbnailSize: number): number {
  return thumbnailSize + 2 * tilePadding;
}

export function tileColumns(width: number, tileWidth: number): number {
  return Math.max(1, Math.floor(width / tileWidth));
}

function target(
  move: GridMove,
  from: number,
  count: number,
  columns: number,
  visible: VisibleRows,
): number {
  const row = Math.floor(from / columns);
  const column = from % columns;
  const lastRow = Math.floor((count - 1) / columns);
  const page = Math.max(1, visible.last - visible.first);
  const inRow = (wanted: number) =>
    wanted > lastRow
      ? count - 1
      : wanted < 0
        ? 0
        : Math.min(count - 1, wanted * columns + column);
  switch (move) {
    case 'left':
      return from - 1;
    case 'right':
      return from + 1;
    case 'up':
      return row === 0 ? from : from - columns;
    case 'down':
      return row === lastRow ? from : Math.min(count - 1, from + columns);
    case 'pageUp':
      return inRow(row > visible.first ? visible.first : row - page);
    case 'pageDown':
      return inRow(row < visible.last ? visible.last : row + page);
    case 'first':
      return 0;
    case 'last':
      return count - 1;
    default:
      return move satisfies never;
  }
}

export function moveInGrid(
  move: GridMove,
  from: number | undefined,
  count: number,
  columns: number,
  visible: VisibleRows,
): number | undefined {
  if (count === 0) {
    return undefined;
  }
  if (from === undefined) {
    return 0;
  }
  const index = Math.max(
    0,
    Math.min(count - 1, target(move, from, count, columns, visible)),
  );
  return index === from ? undefined : index;
}
