import type { BoardEdge, BoardNode } from '../../tools/canvas/shared/board';

export const unit = { width: 7, height: 18 };

export const text = (
  id: string,
  column: number,
  row: number,
  columns: number,
  rows: number,
  words: string,
  more: { readonly color?: string } = {},
): BoardNode => ({
  id,
  type: 'text',
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: rows * unit.height,
  text: words,
  ...more,
});

export const narrow = (cluster: string): number =>
  /[　-鿿]/.test(cluster) ? 2 : 1;

export const edge = (more: Partial<BoardEdge> = {}): BoardEdge => ({
  id: 'e',
  fromNode: 'idea',
  toNode: 'plan',
  ...more,
});
