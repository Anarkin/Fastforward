import type { Board } from '../shared/board';
import { boxOf, type Box, type Unit } from './grid';
import type { Cell } from './routes';

export const nodeSigns = { text: '¶', file: '≡', link: '∞' } as const;

export type SignedKind = keyof typeof nodeSigns;

export const signCellOf = (box: Box): Cell | undefined =>
  box.columns >= 3 && box.rows >= 2
    ? { column: box.column + 1, row: box.row }
    : undefined;

const holds = (box: Box, { column, row }: Cell): boolean =>
  column >= box.column &&
  column < box.column + box.columns &&
  row >= box.row &&
  row < box.row + box.rows;

export function signAt(
  board: Board,
  unit: Unit,
  at: Cell,
): SignedKind | undefined {
  const painted = [
    ...board.nodes.filter((node) => node.type === 'group'),
    ...board.nodes.filter((node) => node.type !== 'group'),
  ];
  const top = painted.findLast((node) => holds(boxOf(node, unit), at));
  if (top === undefined || top.type === 'group') {
    return undefined;
  }
  const sign = signCellOf(boxOf(top, unit));
  return sign?.column === at.column && sign.row === at.row
    ? top.type
    : undefined;
}
