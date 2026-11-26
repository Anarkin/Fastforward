import type { Board, BoardEdge, BoardNode } from '../shared/board';
import type { Wire } from './gestures';
import type { NodeBox } from '../shared/protocol';
import { boxOf, type Box, type Unit } from './grid';
import type { Sides } from './hits';

const leastColumns = 2;

const leastRows = 2;

export const placedSizes = {
  text: { columns: 30, rows: 5 },
  group: { columns: 40, rows: 12 },
} as const;

export const ghostId = '';

export function movedBy(box: Box, columns: number, rows: number): Box {
  return { ...box, column: box.column + columns, row: box.row + rows };
}

function edgeMoved(
  start: number,
  size: number,
  by: number,
  least: number,
  fromStart: boolean,
): { readonly start: number; readonly size: number } {
  if (fromStart) {
    const moved = Math.min(by, size - least);
    return { start: start + moved, size: size - moved };
  }
  return { start, size: Math.max(least, size + by) };
}

export function resizedBy(
  box: Box,
  sides: Sides,
  columns: number,
  rows: number,
): Box {
  const across =
    sides.left || sides.right
      ? edgeMoved(box.column, box.columns, columns, leastColumns, sides.left)
      : { start: box.column, size: box.columns };
  const down =
    sides.top || sides.bottom
      ? edgeMoved(box.row, box.rows, rows, leastRows, sides.top)
      : { start: box.row, size: box.rows };
  return {
    column: across.start,
    columns: across.size,
    row: down.start,
    rows: down.size,
  };
}

export function fileBox(id: string, box: Box, unit: Unit): NodeBox {
  return {
    id,
    x: box.column * unit.width,
    y: box.row * unit.height,
    width: box.columns * unit.width,
    height: box.rows * unit.height,
  };
}

export function previewed(
  board: Board,
  unit: Unit,
  boxes: ReadonlyMap<string, Box>,
  ghost?: { readonly type: 'text' | 'group'; readonly box: Box },
  wire?: Wire,
): Board {
  const nodes = board.nodes.map((node): BoardNode => {
    const box = boxes.get(node.id);
    return box === undefined
      ? node
      : { ...node, ...fileBox(node.id, box, unit) };
  });
  if (ghost !== undefined) {
    const placed = fileBox(ghostId, ghost.box, unit);
    nodes.push(
      ghost.type === 'group'
        ? { ...placed, type: 'group' }
        : { ...placed, type: 'text', text: '' },
    );
  }
  if (wire === undefined) {
    return { nodes, edges: board.edges };
  }
  const { fromNode, fromSide, to } = wire;
  const edge: BoardEdge =
    'node' in to
      ? { id: ghostId, fromNode, fromSide, toNode: to.node, toSide: to.side }
      : { id: ghostId, fromNode, fromSide, toNode: ghostId };
  if ('at' in to) {
    nodes.push({
      ...fileBox(ghostId, { ...to.at, columns: 1, rows: 1 }, unit),
      type: 'text',
      text: '',
    });
  }
  return { nodes, edges: [...board.edges, edge] };
}

export function boxesOf(
  board: Board,
  unit: Unit,
  ids: ReadonlySet<string>,
): Map<string, Box> {
  return new Map(
    board.nodes.flatMap((node): [string, Box][] =>
      ids.has(node.id) ? [[node.id, boxOf(node, unit)]] : [],
    ),
  );
}
