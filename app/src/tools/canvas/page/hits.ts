import type { Board, NodeSide, WhichEnd } from '../shared/board';
import { boxOf, type Box, type Unit } from './grid';
import type { Cell } from './routes';

export interface Sides {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

export type Hit =
  | { readonly kind: 'handle'; readonly id: string; readonly sides: Sides }
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'mark'; readonly id: string; readonly side: NodeSide }
  | { readonly kind: 'edge'; readonly id: string }
  | { readonly kind: 'end'; readonly id: string; readonly end: WhichEnd }
  | { readonly kind: 'empty' };

const leastHandled = 3;

const inside = (box: Box, { column, row }: Cell): boolean =>
  column >= box.column &&
  column < box.column + box.columns &&
  row >= box.row &&
  row < box.row + box.rows;

function sidesAt(box: Box, { column, row }: Cell): Sides {
  return {
    left: column === box.column,
    right: column === box.column + box.columns - 1,
    top: row === box.row,
    bottom: row === box.row + box.rows - 1,
  };
}

const onBorder = (sides: Sides): boolean =>
  sides.left || sides.right || sides.top || sides.bottom;

const onTopAlone = (sides: Sides): boolean =>
  sides.top && !sides.left && !sides.right;

export function hitOf(
  board: Board,
  unit: Unit,
  at: Cell,
  selected: ReadonlySet<string>,
): Hit {
  const topmost = board.nodes.toReversed();
  for (const node of topmost) {
    const box = boxOf(node, unit);
    const sides = sidesAt(box, at);
    if (
      selected.has(node.id) &&
      inside(box, at) &&
      onBorder(sides) &&
      !(node.type === 'group' && onTopAlone(sides)) &&
      box.columns >= leastHandled &&
      box.rows >= leastHandled
    ) {
      return { kind: 'handle', id: node.id, sides };
    }
  }
  for (const node of topmost) {
    const box = boxOf(node, unit);
    if (
      inside(box, at) &&
      (node.type !== 'group' || onBorder(sidesAt(box, at)))
    ) {
      return { kind: 'node', id: node.id };
    }
  }
  return { kind: 'empty' };
}

const meets = (one: Box, other: Box): boolean =>
  one.column < other.column + other.columns &&
  other.column < one.column + one.columns &&
  one.row < other.row + other.rows &&
  other.row < one.row + one.rows;

export const holds = (outer: Box, inner: Box): boolean =>
  inner.column >= outer.column &&
  inner.row >= outer.row &&
  inner.column + inner.columns <= outer.column + outer.columns &&
  inner.row + inner.rows <= outer.row + outer.rows;

export function touched(board: Board, unit: Unit, area: Box): string[] {
  return board.nodes.flatMap((node) => {
    const box = boxOf(node, unit);
    const taken = node.type === 'group' ? holds(area, box) : meets(area, box);
    return taken ? [node.id] : [];
  });
}

export function areaBetween(from: Cell, to: Cell): Box {
  const column = Math.min(from.column, to.column);
  const row = Math.min(from.row, to.row);
  return {
    column,
    row,
    columns: Math.abs(to.column - from.column) + 1,
    rows: Math.abs(to.row - from.row) + 1,
  };
}
