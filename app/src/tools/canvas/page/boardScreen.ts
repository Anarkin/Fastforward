import type { SegmentsOf } from '../../../components/cells/page/cellPainting';
import { languageOf } from '../../../lib/page/languages';
import type { NodeFile } from '../shared/protocol';
import { isHexColor, isPresetColor } from '../shared/protocol';
import type { LineRanges } from '../../../components/syntax/page/engine';
import type { Board, BoardEdge, BoardNode } from '../shared/board';
import type { TextWidths } from '../../../lib/page/textWidths';
import { boxOf, type Box, type Unit } from './grid';
import {
  labelAreaOf,
  coloredSegments,
  edgeLabelAreaOf,
  linkSegments,
  paintLine,
  paintText,
  seeTexts,
  textAreaOf,
} from './textBlocks';
import { reversed, routeOf, type Cell, type Route } from './routes';
import { rowsOf } from './nodeText';
import { nodeSigns, signCellOf } from './nodeSigns';
import {
  emptyScreen,
  Painter,
  wayBits,
  type Screen,
  type Way,
  outsideTop,
  outsideRight,
  outsideBottom,
  outsideLeft,
} from './screen';

export const lineKind = 'line';

export const labelKind = 'label';

export const markKind = 'mark';

export const linkKind = 'link';

const mark = '●';

const tinyNode = '□';

export function colorKind(color: string | undefined): string | undefined {
  if (color === undefined) {
    return undefined;
  }
  if (isPresetColor(color)) {
    return `color-${color}`;
  }
  return isHexColor(color) ? color.toLowerCase() : undefined;
}

export interface Drawn {
  readonly board: Board;
  readonly unit: Unit;
  readonly view: Box;
  readonly widths: TextWidths;
  readonly selected?: ReadonlySet<string>;
  readonly typing?: TypedNode | undefined;
  readonly marks?: readonly Cell[];
  readonly colorsOf?: ColorsOf | undefined;
  readonly titles?: ReadonlyMap<string, string> | undefined;
  readonly files?: Readonly<Record<string, NodeFile>> | undefined;
}

type NodeLooks = Pick<Drawn, 'colorsOf' | 'titles' | 'files'>;

export type ColorsOf = (
  id: string,
  text: string,
  language: string,
) => LineRanges | undefined;

export interface TypedNode {
  readonly id: string;
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
}

const noneSelected: ReadonlySet<string> = new Set();

const wayOf = (from: Cell, to: Cell): Way | undefined => {
  if (to.column > from.column) {
    return 'right';
  }
  if (to.column < from.column) {
    return 'left';
  }
  if (to.row > from.row) {
    return 'down';
  }
  return to.row < from.row ? 'up' : undefined;
};

const bitOf = (from: Cell, to: Cell): number => {
  const way = wayOf(from, to);
  return way === undefined ? 0 : wayBits[way];
};

const onBorder = (box: Box, column: number, row: number): boolean =>
  row === box.row ||
  row === box.row + box.rows - 1 ||
  column === box.column ||
  column === box.column + box.columns - 1;

function border(painter: Painter, box: Box, kind: string | undefined): void {
  const right = box.column + box.columns - 1;
  const bottom = box.row + box.rows - 1;
  if (box.columns === 1 && box.rows === 1) {
    painter.glyph(box.column, box.row, tinyNode, 1, kind ?? lineKind);
    return;
  }
  for (let column = box.column; column <= right; column++) {
    const bits =
      (column > box.column ? wayBits.left : 0) |
      (column < right ? wayBits.right : 0);
    painter.line(column, box.row, bits, kind);
    painter.line(column, bottom, bits, kind);
  }
  for (let row = box.row; row <= bottom; row++) {
    const bits =
      (row > box.row ? wayBits.up : 0) | (row < bottom ? wayBits.down : 0);
    painter.line(box.column, row, bits, kind);
    painter.line(right, row, bits, kind);
  }
}

interface NodeText {
  readonly text: string;
  readonly segmentsOf?: SegmentsOf | undefined;
  readonly body?: NodeText | undefined;
}

function fileTextOf(
  node: Extract<BoardNode, { type: 'file' }>,
  { colorsOf, files }: NodeLooks,
): NodeText {
  const head = node.file + (node.subpath ?? '');
  const shown = files?.[node.file];
  if (shown?.text === undefined) {
    return { text: head, segmentsOf: linkSegments(0, linkKind) };
  }
  const language = languageOf(shown.path);
  const colors =
    language === undefined
      ? undefined
      : colorsOf?.(node.id, shown.text, language);
  return {
    text: head,
    segmentsOf: linkSegments(0, linkKind),
    body: {
      text: shown.text,
      segmentsOf: colors && coloredSegments(shown.text, colors),
    },
  };
}

function nodeTextOf(
  node: BoardNode,
  looks: NodeLooks,
  typed: string | undefined,
): NodeText {
  switch (node.type) {
    case 'text': {
      const text = typed ?? node.text;
      const colors = looks.colorsOf?.(node.id, text, 'markdown');
      return { text, segmentsOf: colors && coloredSegments(text, colors) };
    }
    case 'file':
      return typed === undefined
        ? fileTextOf(node, looks)
        : { text: typed, segmentsOf: linkSegments(0, linkKind) };
    case 'link': {
      if (typed !== undefined) {
        return { text: typed, segmentsOf: linkSegments(0, linkKind) };
      }
      const title = looks.titles?.get(node.url);
      return {
        text: node.url,
        segmentsOf: linkSegments(0, linkKind),
        body: title === undefined ? undefined : { text: title },
      };
    }
    case 'group':
      return { text: typed ?? node.label ?? '' };
    default:
      return node satisfies never;
  }
}

function paintNode(
  painter: Painter,
  node: BoardNode,
  box: Box,
  selected: boolean,
  widths: TextWidths,
  typing: TypedNode | undefined,
  looks: NodeLooks,
): void {
  const kind = colorKind(node.color);
  const right = box.column + box.columns - 1;
  const typed = typing?.id === node.id ? typing : undefined;
  if (node.type === 'group') {
    for (let row = box.row; row < box.row + box.rows; row++) {
      for (let column = box.column; column <= right; column++) {
        if (selected && onBorder(box, column, row)) {
          painter.choose(column, row, true);
        }
      }
    }
    border(painter, box, kind);
    const label = typed?.text ?? node.label;
    if (label !== undefined) {
      const area = labelAreaOf(box);
      paintLine(painter, {
        column: area.column,
        row: area.row,
        text: label,
        room: area.room,
        kind,
        widths,
        typed,
      });
    }
    return;
  }
  const owner = painter.nextOwner();
  const { screen } = painter;
  const top = Math.max(box.row, screen.row);
  const bottom = Math.min(box.row + box.rows, screen.row + screen.rows);
  const left = Math.max(box.column, screen.column);
  const end = Math.min(right, screen.column + screen.columns - 1);
  for (let row = top; row < bottom; row++) {
    for (let column = left; column <= end; column++) {
      painter.clear(column, row);
      painter.cover(
        column,
        row,
        selected
          ? 0
          : (row === box.row ? outsideTop : 0) |
              (column === right ? outsideRight : 0) |
              (row === box.row + box.rows - 1 ? outsideBottom : 0) |
              (column === box.column ? outsideLeft : 0),
      );
      painter.claim(column, row, owner);
      painter.choose(column, row, selected && onBorder(box, column, row));
    }
  }
  border(painter, box, kind);
  const sign = signCellOf(box);
  if (sign !== undefined && (node.type === 'file' || node.type === 'link')) {
    painter.clear(sign.column - 1, sign.row);
    painter.clear(sign.column + 1, sign.row);
    painter.glyph(
      sign.column,
      sign.row,
      nodeSigns[node.type],
      1,
      kind ?? lineKind,
    );
  }
  const shownText = nodeTextOf(node, looks, typed?.text);
  const area = textAreaOf(box);
  const { body } = shownText;
  if (body === undefined) {
    paintText(painter, { owner, area, widths, typed, ...shownText });
    return;
  }
  const headRows = Math.min(
    area.rows,
    rowsOf(shownText.text, area.wrapAt, widths).length,
  );
  paintText(painter, {
    owner,
    area: { ...area, rows: headRows },
    widths,
    text: shownText.text,
    segmentsOf: shownText.segmentsOf,
  });
  const divider = area.row + headRows;
  if (divider + 1 >= box.row + box.rows - 1) {
    paintText(painter, {
      owner,
      area: { ...area, row: divider, rows: area.rows - headRows },
      widths,
      ...body,
    });
    return;
  }
  for (let column = box.column; column <= right; column++) {
    const bits =
      (column > box.column ? wayBits.left : 0) |
      (column < right ? wayBits.right : 0);
    painter.line(column, divider, bits, kind);
  }
  paintText(painter, {
    owner,
    area: { ...area, row: divider + 1, rows: area.rows - headRows - 1 },
    widths,
    ...body,
  });
}

interface Routed {
  readonly edge: BoardEdge;
  readonly route: Route;
  readonly from: Box;
  readonly to: Box;
}

function paintRoute(
  painter: Painter,
  { edge, route }: Routed,
  selected: boolean,
): void {
  const kind = colorKind(edge.color);
  const { cells } = route;
  for (const [at, cell] of cells.entries()) {
    const before = cells[at - 1];
    const after = cells[at + 1];
    if (selected) {
      painter.unarrow(cell.column, cell.row);
    }
    painter.line(
      cell.column,
      cell.row,
      (before === undefined ? 0 : bitOf(cell, before)) |
        (after === undefined ? 0 : bitOf(cell, after)),
      kind,
    );
    painter.edge(cell.column, cell.row, edge.id);
    if (selected) {
      painter.choose(cell.column, cell.row, true);
    }
  }
}

const anchored = (cell: Cell, toward: Cell): Cell => ({
  column: cell.column + toward.column,
  row: cell.row + toward.row,
});

interface End {
  readonly stub: Cell;
  readonly inward: Cell;
  readonly arrow: boolean;
  readonly kind: string | undefined;
  readonly id: string;
}

function paintEnd(
  painter: Painter,
  { stub, inward, arrow, kind, id }: End,
): void {
  const joint = anchored(stub, inward);
  const way = wayOf(stub, joint);
  if (way === undefined) {
    return;
  }
  if (arrow) {
    painter.arrow(stub.column, stub.row, way, kind);
    painter.edge(stub.column, stub.row, id);
    return;
  }
  painter.line(stub.column, stub.row, wayBits[way], kind);
  painter.edge(stub.column, stub.row, id);
  if (painter.linesAt(joint.column, joint.row) !== 0) {
    const at = painter.indexOf(joint.column, joint.row);
    const kept = at === undefined ? undefined : painter.screen.lineKinds[at];
    painter.line(joint.column, joint.row, bitOf(joint, stub), kept);
  }
}

const inwardOf = (route: Route, end: 'from' | 'to'): Cell => {
  const side = end === 'from' ? route.fromSide : route.toSide;
  const outward = {
    top: { column: 0, row: -1 },
    right: { column: 1, row: 0 },
    bottom: { column: 0, row: 1 },
    left: { column: -1, row: 0 },
  }[side];
  return reversed(outward);
};

function paintEnds(
  painter: Painter,
  { edge, route }: Routed,
  selected: boolean,
): void {
  const shared = {
    kind: colorKind(edge.color),
    id: edge.id,
  };
  if (selected) {
    for (const end of ['from', 'to'] as const) {
      const stub = route[end];
      const joint = anchored(stub, inwardOf(route, end));
      painter.choose(stub.column, stub.row, true);
      painter.choose(joint.column, joint.row, true);
    }
  }
  paintEnd(painter, {
    ...shared,
    stub: route.from,
    inward: inwardOf(route, 'from'),
    arrow: edge.fromEnd === 'arrow',
  });
  paintEnd(painter, {
    ...shared,
    stub: route.to,
    inward: inwardOf(route, 'to'),
    arrow: (edge.toEnd ?? 'arrow') === 'arrow',
  });
}

function paintLabel(
  painter: Painter,
  { edge, route }: Routed,
  widths: TextWidths,
  typing: TypedNode | undefined,
  selected = false,
): void {
  const typed = typing?.id === edge.id ? typing : undefined;
  const label = typed?.text ?? edge.label ?? '';
  const area = edgeLabelAreaOf(route, label, widths);
  if (area === undefined || (typed === undefined && label === '')) {
    return;
  }
  paintLine(painter, {
    column: area.column,
    row: area.row,
    text: label,
    room: area.room,
    kind: labelKind,
    widths,
    typed,
  });
  for (
    let column = area.column - 1;
    column <= area.column + area.room;
    column++
  ) {
    painter.edge(column, area.row, edge.id);
    if (selected) {
      painter.choose(column, area.row, true);
    }
  }
}

const routeReach = 3;

const spanning = (one: Box, other: Box): Box => {
  const column = Math.min(one.column, other.column);
  const row = Math.min(one.row, other.row);
  return {
    column,
    row,
    columns:
      Math.max(one.column + one.columns, other.column + other.columns) - column,
    rows: Math.max(one.row + one.rows, other.row + other.rows) - row,
  };
};

export function screenOf({
  board,
  unit,
  view,
  widths,
  selected = noneSelected,
  typing,
  marks = [],
  colorsOf,
  titles,
  files,
}: Drawn): Screen {
  const painter = new Painter(emptyScreen(view));
  const boxes = new Map(
    board.nodes.map((node) => [node.id, boxOf(node, unit)]),
  );
  const inView = (box: Box, across = 0, down = 0) =>
    box.column - across < view.column + view.columns &&
    box.column + box.columns + across > view.column &&
    box.row - down < view.row + view.rows &&
    box.row + box.rows + down > view.row;
  const routed = board.edges.flatMap((edge): Routed[] => {
    const from = boxes.get(edge.fromNode);
    const to = boxes.get(edge.toNode);
    return from === undefined ||
      to === undefined ||
      !inView(
        spanning(from, to),
        routeReach + 2 * (edge.label?.length ?? 0),
        routeReach,
      )
      ? []
      : [
          {
            edge,
            from,
            to,
            route: routeOf(from, to, unit, edge.fromSide, edge.toSide),
          },
        ];
  });
  const paint = (node: BoardNode) => {
    const box = boxes.get(node.id);
    if (box !== undefined && inView(box)) {
      paintNode(painter, node, box, selected.has(node.id), widths, typing, {
        colorsOf,
        titles,
        files,
      });
    }
  };
  for (const node of board.nodes) {
    if (node.type === 'group') {
      paint(node);
    }
  }
  const chosenEdges = routed.filter((each) => selected.has(each.edge.id));
  const otherEdges = routed.filter((each) => !selected.has(each.edge.id));
  for (const each of otherEdges) {
    paintRoute(painter, each, false);
  }
  for (const node of board.nodes) {
    if (node.type !== 'group') {
      paint(node);
    }
  }
  for (const each of otherEdges) {
    paintEnds(painter, each, false);
    paintLabel(painter, each, widths, typing);
  }
  for (const each of chosenEdges) {
    paintRoute(painter, each, true);
    paintEnds(painter, each, true);
    paintLabel(painter, each, widths, typing, true);
  }
  for (const cell of marks) {
    const at = painter.indexOf(cell.column, cell.row);
    if (at !== undefined && painter.screen.arrows[at] === undefined) {
      painter.glyph(cell.column, cell.row, mark, 1, markKind);
    }
  }
  const { screen } = painter;
  screen.see = () => seeTexts(screen, widths);
  return screen;
}

export function boundsOf(board: Board, unit: Unit): Box | undefined {
  const boxes = board.nodes.map((node) => boxOf(node, unit));
  const [first] = boxes;
  if (first === undefined) {
    return undefined;
  }
  let left = first.column;
  let top = first.row;
  let right = first.column + first.columns;
  let bottom = first.row + first.rows;
  for (const box of boxes) {
    left = Math.min(left, box.column);
    top = Math.min(top, box.row);
    right = Math.max(right, box.column + box.columns);
    bottom = Math.max(bottom, box.row + box.rows);
  }
  return { column: left, row: top, columns: right - left, rows: bottom - top };
}
