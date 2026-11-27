import type { Board, WhichEnd } from '../shared/board';
import { boxOf, type Unit } from './grid';
import { routeOf, type Cell } from './routes';

export interface EdgeEndAt {
  readonly id: string;
  readonly end: WhichEnd;
}

const same = (one: Cell, other: Cell): boolean =>
  one.column === other.column && one.row === other.row;

export function endAt(
  board: Board,
  unit: Unit,
  at: Cell,
  selected: readonly string[],
): EdgeEndAt | undefined {
  const nodes = new Map(board.nodes.map((node) => [node.id, node]));
  for (const edge of board.edges) {
    const from = nodes.get(edge.fromNode);
    const to = nodes.get(edge.toNode);
    if (!selected.includes(edge.id) || from === undefined || to === undefined) {
      continue;
    }
    const route = routeOf(
      boxOf(from, unit),
      boxOf(to, unit),
      unit,
      edge.fromSide,
      edge.toSide,
    );
    if (same(route.from, at)) {
      return { id: edge.id, end: 'from' };
    }
    if (same(route.to, at)) {
      return { id: edge.id, end: 'to' };
    }
  }
  return undefined;
}
