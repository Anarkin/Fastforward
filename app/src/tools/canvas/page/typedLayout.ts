import type { ScreenRow } from '../../../components/cells/page/lines';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { Board } from '../shared/board';
import { boxOf, type Unit } from './grid';
import { offsetAt, placeOf, rowsOf } from './nodeText';
import type { Cell } from './routes';
import { labelAreaOf, scrollOf, textAreaOf, type TextArea } from './textBlocks';

export interface TypedLayout {
  readonly area: TextArea;
  readonly rows: readonly ScreenRow[];
  readonly scroll: number;
  readonly widths: TextWidths;
}

export function typedLayout(
  board: Board,
  unit: Unit,
  widths: TextWidths,
  {
    id,
    text,
    head,
    assoc,
  }: {
    readonly id: string;
    readonly text: string;
    readonly head: number;
    readonly assoc?: number | undefined;
  },
): TypedLayout | undefined {
  const node = board.nodes.find((each) => each.id === id);
  if (node === undefined) {
    return undefined;
  }
  const box = boxOf(node, unit);
  const area = node.type === 'group' ? labelAreaOf(box) : textAreaOf(box);
  const rows = rowsOf(text, area.wrapAt, widths);
  return {
    area,
    rows,
    scroll: scrollOf(placeOf(rows, head, widths, assoc), area),
    widths,
  };
}

export function offsetIn(
  { area, rows, scroll, widths }: TypedLayout,
  at: Cell,
): number {
  return offsetAt(
    rows,
    { row: at.row - area.row + scroll, column: at.column - area.column },
    widths,
  );
}
