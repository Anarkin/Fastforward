import type { Board, BoardEdge, BoardNode } from '../shared/board';
import { boxOf, type Box, type Unit } from './grid';
import {
  laidOut,
  placeOf,
  textRows,
  type Glyph,
  type Place,
  type TextRow,
} from './nodeText';
import { reversed, routeOf, type Cell, type Route } from './routes';
import {
  doubleShift,
  emptyScreen,
  Painter,
  wayBits,
  type Screen,
  type Way,
} from './screen';

export const lineKind = 'line';

export const labelKind = 'label';

const tinyNode = '□';

const presets = /^[1-6]$/;

const hexColor = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

export function colorKind(color: string | undefined): string | undefined {
  if (color === undefined) {
    return undefined;
  }
  if (presets.test(color)) {
    return `color-${color}`;
  }
  return hexColor.test(color) ? color.toLowerCase() : undefined;
}

export interface Drawn {
  readonly board: Board;
  readonly unit: Unit;
  readonly view: Box;
  readonly cellsOf: (cluster: string) => number;
  readonly selected?: ReadonlySet<string>;
  readonly typing?: TypedNode | undefined;
}

export interface TypedNode {
  readonly id: string;
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
}

export function textAreaOf(box: Box): Box {
  const padding = box.columns >= 5 ? 1 : 0;
  return {
    column: box.column + 1 + padding,
    row: box.row + 1,
    columns: box.columns - 2 - 2 * padding,
    rows: box.rows - 2,
  };
}

export const scrollOf = (place: Place | undefined, area: Box): number =>
  Math.max(0, (place?.row ?? 0) - (area.rows - 1));

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

function border(
  painter: Painter,
  box: Box,
  weight: number,
  kind: string | undefined,
): void {
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
    painter.line(column, box.row, bits << weight, kind);
    painter.line(column, bottom, bits << weight, kind);
  }
  for (let row = box.row; row <= bottom; row++) {
    const bits =
      (row > box.row ? wayBits.up : 0) | (row < bottom ? wayBits.down : 0);
    painter.line(box.column, row, bits << weight, kind);
    painter.line(right, row, bits << weight, kind);
  }
}

function written(
  painter: Painter,
  column: number,
  row: number,
  glyphs: readonly Glyph[],
  until: number,
  kind?: string,
): void {
  let at = column;
  for (const glyph of glyphs) {
    if (at + glyph.cells - 1 > until) {
      return;
    }
    painter.glyph(at, row, glyph.text, glyph.cells, glyph.kind ?? kind);
    at += glyph.cells;
  }
}

function contentOf(node: BoardNode): string {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'file':
      return node.file + (node.subpath ?? '');
    case 'link':
      return node.url;
    case 'group':
      return node.label ?? '';
    default:
      return node satisfies never;
  }
}

function chooseRow(
  painter: Painter,
  row: TextRow,
  area: Box,
  y: number,
  { from, to }: { readonly from: number; readonly to: number },
): void {
  const last = area.column + area.columns - 1;
  let column = area.column;
  for (const glyph of row.glyphs) {
    if (glyph.from >= from && glyph.to <= to) {
      for (let cell = 0; cell < glyph.cells; cell++) {
        painter.choose(Math.min(last, column + cell), y);
      }
    }
    column += glyph.cells;
  }
  const end = row.glyphs.at(-1)?.to ?? row.from;
  if (
    to > row.to &&
    from <= row.to &&
    (!row.wraps || row.to > end) &&
    column <= last
  ) {
    painter.choose(column, y);
  }
}

function paintTyped(
  painter: Painter,
  area: Box,
  typing: TypedNode,
  cellsOf: (cluster: string) => number,
): void {
  if (area.columns <= 0 || area.rows <= 0) {
    return;
  }
  const rows = laidOut(typing.text, area.columns, Infinity, cellsOf);
  const place = placeOf(rows, typing.head, area.columns);
  const scroll = scrollOf(place, area);
  const span = {
    from: Math.min(typing.anchor, typing.head),
    to: Math.max(typing.anchor, typing.head),
  };
  const last = area.column + area.columns - 1;
  for (let index = 0; index < area.rows; index++) {
    const row = rows[scroll + index];
    if (row === undefined) {
      break;
    }
    written(painter, area.column, area.row + index, row.glyphs, last);
    if (span.from !== span.to) {
      chooseRow(painter, row, area, area.row + index, span);
    }
  }
  if (place !== undefined) {
    painter.caret(area.column + place.column, area.row + place.row - scroll);
  }
}

function paintNode(
  painter: Painter,
  node: BoardNode,
  box: Box,
  selected: boolean,
  cellsOf: (cluster: string) => number,
  typing: TypedNode | undefined,
): void {
  const kind = colorKind(node.color);
  const weight = selected ? doubleShift : 0;
  const right = box.column + box.columns - 1;
  if (node.type === 'group') {
    border(painter, box, weight, kind);
    const [label] = textRows(
      ` ${contentOf(node)} `,
      box.columns - 4,
      1,
      cellsOf,
    );
    if (node.label !== undefined && label !== undefined) {
      written(painter, box.column + 2, box.row, label, right - 2, kind);
    }
    return;
  }
  const { screen } = painter;
  const top = Math.max(box.row, screen.row);
  const bottom = Math.min(box.row + box.rows, screen.row + screen.rows);
  const left = Math.max(box.column, screen.column);
  const end = Math.min(right, screen.column + screen.columns - 1);
  for (let row = top; row < bottom; row++) {
    for (let column = left; column <= end; column++) {
      painter.clear(column, row);
      painter.cover(column, row);
    }
  }
  border(painter, box, weight, kind);
  const area = textAreaOf(box);
  if (typing?.id === node.id) {
    paintTyped(painter, area, typing, cellsOf);
    return;
  }
  const last = area.column + area.columns - 1;
  const rows = textRows(contentOf(node), area.columns, area.rows, cellsOf);
  for (const [index, glyphs] of rows.entries()) {
    written(painter, area.column, area.row + index, glyphs, last);
  }
}

interface Routed {
  readonly edge: BoardEdge;
  readonly route: Route;
  readonly from: Box;
  readonly to: Box;
}

function paintRoute(painter: Painter, { edge, route }: Routed): void {
  const kind = colorKind(edge.color);
  const { cells } = route;
  for (const [at, cell] of cells.entries()) {
    const before = cells[at - 1];
    const after = cells[at + 1];
    painter.line(
      cell.column,
      cell.row,
      (before === undefined ? 0 : bitOf(cell, before)) |
        (after === undefined ? 0 : bitOf(cell, after)),
      kind,
    );
  }
}

const anchored = (cell: Cell, toward: Cell): Cell => ({
  column: cell.column + toward.column,
  row: cell.row + toward.row,
});

function paintEnd(
  painter: Painter,
  stub: Cell,
  inward: Cell,
  arrow: boolean,
  kind: string | undefined,
): void {
  const joint = anchored(stub, inward);
  const way = wayOf(stub, joint);
  if (way === undefined) {
    return;
  }
  if (arrow) {
    painter.arrow(stub.column, stub.row, way, kind);
    return;
  }
  painter.line(stub.column, stub.row, wayBits[way], kind);
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

function paintEnds(painter: Painter, { edge, route }: Routed): void {
  const kind = colorKind(edge.color);
  paintEnd(
    painter,
    route.from,
    inwardOf(route, 'from'),
    edge.fromEnd === 'arrow',
    kind,
  );
  paintEnd(
    painter,
    route.to,
    inwardOf(route, 'to'),
    (edge.toEnd ?? 'arrow') === 'arrow',
    kind,
  );
}

function paintLabel(
  painter: Painter,
  { edge, route }: Routed,
  cellsOf: (cluster: string) => number,
): void {
  if (edge.label === undefined || edge.label === '') {
    return;
  }
  const middle = route.cells[Math.floor(route.cells.length / 2)];
  const [glyphs] = textRows(` ${edge.label} `, Infinity, 1, cellsOf);
  if (middle === undefined || glyphs === undefined) {
    return;
  }
  const width = glyphs.reduce((cells, glyph) => cells + glyph.cells, 0);
  const start = middle.column - Math.floor(width / 2);
  written(painter, start, middle.row, glyphs, start + width - 1, labelKind);
}

export function screenOf({
  board,
  unit,
  view,
  cellsOf,
  selected = noneSelected,
  typing,
}: Drawn): Screen {
  const painter = new Painter(emptyScreen(view));
  const boxes = new Map(
    board.nodes.map((node) => [node.id, boxOf(node, unit)]),
  );
  const routed = board.edges.flatMap((edge): Routed[] => {
    const from = boxes.get(edge.fromNode);
    const to = boxes.get(edge.toNode);
    return from === undefined || to === undefined
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
    if (box !== undefined) {
      paintNode(painter, node, box, selected.has(node.id), cellsOf, typing);
    }
  };
  for (const node of board.nodes) {
    if (node.type === 'group') {
      paint(node);
    }
  }
  for (const each of routed) {
    paintRoute(painter, each);
  }
  for (const node of board.nodes) {
    if (node.type !== 'group') {
      paint(node);
    }
  }
  for (const each of routed) {
    paintEnds(painter, each);
    paintLabel(painter, each, cellsOf);
  }
  return painter.screen;
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
