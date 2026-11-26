import type { Board } from '../shared/board';
import { scrollOf, textAreaOf } from './boardScreen';
import { boxOf, type Box, type Unit } from './grid';
import { laidOut, offsetAt, placeOf, type TextRow } from './nodeText';
import type { Cell } from './routes';

export interface TypedLayout {
  readonly area: Box;
  readonly rows: readonly TextRow[];
  readonly scroll: number;
}

export function typedLayout(
  board: Board,
  unit: Unit,
  cellsOf: (cluster: string) => number,
  {
    id,
    text,
    head,
  }: { readonly id: string; readonly text: string; readonly head: number },
): TypedLayout | undefined {
  const node = board.nodes.find((each) => each.id === id);
  if (node === undefined) {
    return undefined;
  }
  const area = textAreaOf(boxOf(node, unit));
  const rows = laidOut(text, area.columns, Infinity, cellsOf);
  return {
    area,
    rows,
    scroll: scrollOf(placeOf(rows, head, area.columns), area),
  };
}

export function offsetIn(
  { area, rows, scroll }: TypedLayout,
  at: Cell,
): number {
  return offsetAt(rows, {
    row: at.row - area.row + scroll,
    column: Math.max(0, at.column - area.column),
  });
}
