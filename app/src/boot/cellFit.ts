import { pagePixels, type CellGrid, type Size } from '../shell/shared/cellGrid';

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

export const screenAt = (
  client: number,
  around: number,
  scale: number,
): number => pagePixels(client, scale) - around;

interface Axis {
  readonly around: number;
  readonly cell: number;
  readonly scale: number;
  readonly least: number;
  readonly grain: number;
}

const fits = (client: number, { around, cell, scale, least, grain }: Axis) => {
  const screen = screenAt(client, around, scale);
  return (
    client >= least &&
    client % grain === 0 &&
    screen >= cell &&
    screen % cell === 0 &&
    screenAt(client - grain, around, scale) !== screen
  );
};

const reachOf = ({ cell, scale }: Axis) => Math.ceil(2 * cell * scale) + 4;

function fittedUp(length: number, axis: Axis): number {
  const from = Math.max(length, axis.least);
  for (let client = from; client <= from + reachOf(axis); client++) {
    if (fits(client, axis)) {
      return client;
    }
  }
  return length;
}

function fittedDown(length: number, axis: Axis): number {
  for (let client = length; client >= length - reachOf(axis); client--) {
    if (fits(client, axis)) {
      return client;
    }
  }
  return fittedUp(length, axis);
}

function fittedNear(length: number, axis: Axis): number {
  for (let by = 0; by <= reachOf(axis); by++) {
    for (const client of [length - by, length + by]) {
      if (fits(client, axis)) {
        return client;
      }
    }
  }
  return length;
}

const axesOf = (
  { cell, around, scale }: CellGrid,
  least: Size,
  grain = 1,
): { readonly width: Axis; readonly height: Axis } => ({
  width: {
    around: around.width,
    cell: cell.width,
    scale,
    least: least.width,
    grain,
  },
  height: {
    around: around.height,
    cell: cell.height,
    scale,
    least: least.height,
    grain,
  },
});

export function fittedSize(
  area: Size,
  grid: CellGrid,
  least: Size = noLeast,
  grain = 1,
): Size {
  const axes = axesOf(grid, least, grain);
  return {
    width: fittedDown(area.width, axes.width),
    height: fittedDown(area.height, axes.height),
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
  grid: CellGrid,
  least: Size = noLeast,
): Edges {
  const axes = axesOf(grid, least);
  const width =
    fittedNear(rect.right - rect.left - frame.width, axes.width) + frame.width;
  const height =
    fittedNear(rect.bottom - rect.top - frame.height, axes.height) +
    frame.height;
  return {
    left: movesLeft.has(edge) ? rect.right - width : rect.left,
    right: movesRight.has(edge) ? rect.left + width : rect.right,
    top: movesTop.has(edge) ? rect.bottom - height : rect.top,
    bottom: movesBottom.has(edge) ? rect.top + height : rect.bottom,
  };
}
