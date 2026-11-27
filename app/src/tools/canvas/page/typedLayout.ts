import type { ScreenRow } from '../../../components/cells/page/lines';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { Board } from '../shared/board';
import { boxOf, type Unit } from './grid';
import { offsetAt, placeOf, rowsOf } from './nodeText';
import { routeOf, type Cell } from './routes';
import {
  edgeLabelAreaOf,
  labelAreaOf,
  lineWidthOf,
  scrollOf,
  sidewaysOf,
  textAreaOf,
  type TextArea,
} from './textBlocks';

export interface TypedLayout {
  readonly area: TextArea;
  readonly rows: readonly ScreenRow[];
  readonly scroll: number;
  readonly across: number;
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
    return edgeLayout(board, unit, widths, id, text);
  }
  const box = boxOf(node, unit);
  const area = node.type === 'group' ? labelAreaOf(box) : textAreaOf(box);
  const rows = rowsOf(text, area.wrapAt, widths);
  const place = placeOf(rows, head, widths, assoc);
  return {
    area,
    rows,
    scroll: scrollOf(place, area),
    across:
      node.type === 'group'
        ? sidewaysOf(place, area.room, lineWidthOf(text, widths))
        : 0,
    widths,
  };
}

function edgeLayout(
  board: Board,
  unit: Unit,
  widths: TextWidths,
  id: string,
  text: string,
): TypedLayout | undefined {
  const edge = board.edges.find((each) => each.id === id);
  const boxOfNode = (nodeId: string | undefined) => {
    const found = board.nodes.find((each) => each.id === nodeId);
    return found === undefined ? undefined : boxOf(found, unit);
  };
  const from = boxOfNode(edge?.fromNode);
  const to = boxOfNode(edge?.toNode);
  const area =
    edge === undefined || from === undefined || to === undefined
      ? undefined
      : edgeLabelAreaOf(
          routeOf(from, to, unit, edge.fromSide, edge.toSide),
          text,
          widths,
        );
  return area === undefined
    ? undefined
    : {
        area,
        rows: rowsOf(text, undefined, widths),
        scroll: 0,
        across: 0,
        widths,
      };
}

export function offsetIn(
  { area, rows, scroll, across, widths }: TypedLayout,
  at: Cell,
): number {
  return offsetAt(
    rows,
    {
      row: at.row - area.row + scroll,
      column: at.column - area.column + across,
    },
    widths,
  );
}
