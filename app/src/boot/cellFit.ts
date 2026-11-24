import type { CellGrid, Size } from '../shell/shared/cellGrid';

export interface Edges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type DraggedEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight';

const noLeast: Size = { width: 0, height: 0 };

const fitted = (
  length: number,
  around: number,
  cell: number,
  rounded: (cells: number) => number,
  least: number,
) =>
  around +
  Math.max(
    1,
    rounded((length - around) / cell),
    Math.ceil((least - around) / cell),
  ) *
    cell;

export function fittedSize(
  area: Size,
  { cell, around }: CellGrid,
  least: Size = noLeast,
): Size {
  return {
    width: fitted(
      area.width,
      around.width,
      cell.width,
      Math.floor,
      least.width,
    ),
    height: fitted(
      area.height,
      around.height,
      cell.height,
      Math.floor,
      least.height,
    ),
  };
}

const movesLeft: ReadonlySet<DraggedEdge> = new Set([
  'left',
  'topLeft',
  'bottomLeft',
]);

const movesRight: ReadonlySet<DraggedEdge> = new Set([
  'right',
  'topRight',
  'bottomRight',
]);

const movesTop: ReadonlySet<DraggedEdge> = new Set([
  'top',
  'topLeft',
  'topRight',
]);

const movesBottom: ReadonlySet<DraggedEdge> = new Set([
  'bottom',
  'bottomLeft',
  'bottomRight',
]);

export function draggedTo(
  rect: Edges,
  edge: DraggedEdge,
  frame: Size,
  { cell, around }: CellGrid,
  least: Size = noLeast,
): Edges {
  const width =
    fitted(
      rect.right - rect.left - frame.width,
      around.width,
      cell.width,
      Math.round,
      least.width,
    ) + frame.width;
  const height =
    fitted(
      rect.bottom - rect.top - frame.height,
      around.height,
      cell.height,
      Math.round,
      least.height,
    ) + frame.height;
  return {
    left: movesLeft.has(edge) ? rect.right - width : rect.left,
    right: movesRight.has(edge) ? rect.left + width : rect.right,
    top: movesTop.has(edge) ? rect.bottom - height : rect.top,
    bottom: movesBottom.has(edge) ? rect.top + height : rect.bottom,
  };
}
