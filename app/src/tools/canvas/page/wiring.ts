import { nodeSides, type Board, type NodeSide } from '../shared/board';
import { boxOf, type Box, type Unit } from './grid';
import { stubOf, type Cell } from './routes';

export interface Mark {
  readonly id: string;
  readonly side: NodeSide;
  readonly cell: Cell;
}

const holds = (box: Box, { column, row }: Cell, grown: number): boolean =>
  column >= box.column - grown &&
  column < box.column + box.columns + grown &&
  row >= box.row - grown &&
  row < box.row + box.rows + grown;

export function hoveredAt(
  board: Board,
  unit: Unit,
  at: Cell,
): { readonly id: string; readonly box: Box } | undefined {
  for (const node of board.nodes.toReversed()) {
    const box = boxOf(node, unit);
    if (holds(box, at, 1) && (node.type !== 'group' || !holds(box, at, -2))) {
      return { id: node.id, box };
    }
  }
  return undefined;
}

export const marksOf = (id: string, box: Box): Mark[] =>
  nodeSides.map((side) => ({ id, side, cell: stubOf(box, side) }));

export function markAt(board: Board, unit: Unit, at: Cell): Mark | undefined {
  const hovered = hoveredAt(board, unit, at);
  return hovered === undefined
    ? undefined
    : marksOf(hovered.id, hovered.box).find(
        ({ cell }) => cell.column === at.column && cell.row === at.row,
      );
}

export function nearestSide(box: Box, at: Cell, unit: Unit): NodeSide {
  let nearest: NodeSide = 'top';
  let least = Infinity;
  for (const side of nodeSides) {
    const cell = stubOf(box, side);
    const far = Math.hypot(
      (cell.column - at.column) * unit.width,
      (cell.row - at.row) * unit.height,
    );
    if (far < least) {
      least = far;
      nearest = side;
    }
  }
  return nearest;
}
