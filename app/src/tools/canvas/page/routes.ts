import type { NodeSide } from '../shared/board';
import type { Box, Unit } from './grid';

export interface Cell {
  readonly column: number;
  readonly row: number;
}

export interface Route {
  readonly from: Cell;
  readonly to: Cell;
  readonly fromSide: NodeSide;
  readonly toSide: NodeSide;
  readonly cells: readonly Cell[];
}

const normals: Readonly<Record<NodeSide, Cell>> = {
  top: { column: 0, row: -1 },
  right: { column: 1, row: 0 },
  bottom: { column: 0, row: 1 },
  left: { column: -1, row: 0 },
};

export const normalOf = (side: NodeSide): Cell => normals[side];

const moved = (cell: Cell, by: Cell, times = 1): Cell => ({
  column: cell.column + by.column * times,
  row: cell.row + by.row * times,
});

export const reversed = ({ column, row }: Cell): Cell => ({
  column: -column || 0,
  row: -row || 0,
});

function anchorOf(box: Box, side: NodeSide): Cell {
  const middleColumn = box.column + Math.floor((box.columns - 1) / 2);
  const middleRow = box.row + Math.floor((box.rows - 1) / 2);
  switch (side) {
    case 'top':
      return { column: middleColumn, row: box.row };
    case 'bottom':
      return { column: middleColumn, row: box.row + box.rows - 1 };
    case 'left':
      return { column: box.column, row: middleRow };
    case 'right':
      return { column: box.column + box.columns - 1, row: middleRow };
    default:
      return side satisfies never;
  }
}

export const stubOf = (box: Box, side: NodeSide): Cell =>
  moved(anchorOf(box, side), normalOf(side));

const centerOf = (box: Box) => ({
  column: box.column + box.columns / 2,
  row: box.row + box.rows / 2,
});

function sideToward(box: Box, other: Box, unit: Unit): NodeSide {
  const from = centerOf(box);
  const to = centerOf(other);
  const across = (to.column - from.column) * unit.width;
  const down = (to.row - from.row) * unit.height;
  if (Math.abs(across) >= Math.abs(down)) {
    return across >= 0 ? 'right' : 'left';
  }
  return down >= 0 ? 'bottom' : 'top';
}

const sign = (value: number) => Math.sign(value) || 0;

const stepOf = (from: Cell, to: Cell): Cell => ({
  column: sign(to.column - from.column),
  row: sign(to.row - from.row),
});

const same = (a: Cell, b: Cell) => a.column === b.column && a.row === b.row;

function simplified(points: readonly Cell[]): Cell[] {
  const kept: Cell[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last !== undefined && same(last, point)) {
      continue;
    }
    const before = kept.at(-2);
    if (
      last !== undefined &&
      before !== undefined &&
      same(stepOf(before, last), stepOf(last, point))
    ) {
      kept[kept.length - 1] = point;
    } else {
      kept.push(point);
    }
  }
  return kept;
}

function legsOf(points: readonly Cell[]): Cell[] | undefined {
  const legs: Cell[] = [];
  for (let at = 1; at < points.length; at++) {
    const from = points[at - 1];
    const to = points[at];
    if (
      from === undefined ||
      to === undefined ||
      (from.column !== to.column && from.row !== to.row)
    ) {
      return undefined;
    }
    legs.push(stepOf(from, to));
  }
  return legs;
}

function costOf(
  points: readonly Cell[],
  leaving: Cell,
  arriving: Cell,
): number | undefined {
  const legs = legsOf(points);
  const [first] = legs ?? [];
  const last = legs?.at(-1);
  if (legs === undefined) {
    return undefined;
  }
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (!same(first, leaving) || !same(last, arriving)) {
    return undefined;
  }
  for (let at = 1; at < legs.length; at++) {
    const before = legs[at - 1];
    const leg = legs[at];
    if (
      before !== undefined &&
      leg !== undefined &&
      same(before, reversed(leg))
    ) {
      return undefined;
    }
  }
  let length = 0;
  for (let at = 1; at < points.length; at++) {
    const from = points[at - 1];
    const to = points[at];
    if (from !== undefined && to !== undefined) {
      length += Math.abs(to.column - from.column) + Math.abs(to.row - from.row);
    }
  }
  return length + 2 * (legs.length - 1);
}

function candidates(
  start: Cell,
  end: Cell,
  leaving: Cell,
  arriving: Cell,
  around: {
    readonly columns: readonly number[];
    readonly rows: readonly number[];
  },
): Cell[][] {
  const out = moved(start, leaving);
  const into = moved(end, arriving, -1);
  const middleColumn = Math.round((start.column + end.column) / 2);
  const middleRow = Math.round((start.row + end.row) / 2);
  const found: Cell[][] = [
    [start, end],
    [start, { column: end.column, row: start.row }, end],
    [start, { column: start.column, row: end.row }, end],
    [
      start,
      { column: middleColumn, row: start.row },
      { column: middleColumn, row: end.row },
      end,
    ],
    [
      start,
      { column: start.column, row: middleRow },
      { column: end.column, row: middleRow },
      end,
    ],
    [start, out, { column: out.column, row: into.row }, into, end],
    [start, out, { column: into.column, row: out.row }, into, end],
  ];
  for (const row of [Math.round((out.row + into.row) / 2), ...around.rows]) {
    found.push([
      start,
      out,
      { column: out.column, row },
      { column: into.column, row },
      into,
      end,
    ]);
  }
  for (const column of [
    Math.round((out.column + into.column) / 2),
    ...around.columns,
  ]) {
    found.push([
      start,
      out,
      { column, row: out.row },
      { column, row: into.row },
      into,
      end,
    ]);
  }
  return found;
}

function cellsAlong(points: readonly Cell[]): Cell[] {
  const [first] = points;
  if (first === undefined) {
    return [];
  }
  const cells: Cell[] = [first];
  for (let at = 1; at < points.length; at++) {
    const to = points[at];
    let from = points[at - 1];
    if (to === undefined || from === undefined) {
      continue;
    }
    const step = stepOf(from, to);
    while (!same(from, to)) {
      from = moved(from, step);
      cells.push(from);
    }
  }
  return cells;
}

export function routeOf(
  from: Box,
  to: Box,
  unit: Unit,
  fromSide: NodeSide = sideToward(from, to, unit),
  toSide: NodeSide = sideToward(to, from, unit),
): Route {
  const leaving = normalOf(fromSide);
  const arriving = reversed(normalOf(toSide));
  const start = moved(anchorOf(from, fromSide), leaving);
  const end = moved(anchorOf(to, toSide), normalOf(toSide));
  const around = {
    columns: [
      Math.min(from.column, to.column) - 2,
      Math.max(from.column + from.columns, to.column + to.columns) + 1,
    ],
    rows: [
      Math.min(from.row, to.row) - 2,
      Math.max(from.row + from.rows, to.row + to.rows) + 1,
    ],
  };
  let best: { readonly points: Cell[]; readonly cost: number } | undefined;
  for (const points of candidates(start, end, leaving, arriving, around)) {
    const kept = simplified(points);
    const cost = costOf(kept, leaving, arriving);
    if (cost !== undefined && (best === undefined || cost < best.cost)) {
      best = { points: kept, cost };
    }
  }
  return {
    from: start,
    to: end,
    fromSide,
    toSide,
    cells: cellsAlong(best?.points ?? [start]),
  };
}
