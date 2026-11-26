import { seenCells } from '../../../components/cells/page/textPlaces';
import type { TextSelection } from '../../../components/cells/page/textSelection';
import { columnsOf } from '../../../components/cells/page/columns';
import type { TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import type { Box } from './grid';
import { linesOf, placeOf, rowsOf, textPlaceOf, type Place } from './nodeText';
import type { Painter, Screen, TextBlock } from './screen';

export interface TextArea extends Box {
  readonly room: number;
  readonly wrapAt: number | undefined;
}

const breakColumns = 2;

export function textAreaOf(box: Box): TextArea {
  const padding = box.columns >= 5 ? 1 : 0;
  const room = box.columns - 2 - padding;
  return {
    column: box.column + 1 + padding,
    row: box.row + 1,
    columns: box.columns - 2 - 2 * padding,
    rows: box.rows - 2,
    room,
    wrapAt: Math.max(1, room - breakColumns),
  };
}

export function labelAreaOf(box: Box): TextArea {
  const room = box.columns - 6;
  return {
    column: box.column + 3,
    row: box.row,
    columns: Math.max(0, room),
    rows: 1,
    room,
    wrapAt: undefined,
  };
}

export const scrollOf = (place: Place | undefined, area: Box): number =>
  Math.max(0, (place?.row ?? 0) - (area.rows - 1));

export interface Typed {
  readonly anchor: number;
  readonly head: number;
}

function selectionOf(
  rows: Parameters<typeof textPlaceOf>[0],
  { anchor, head }: Typed,
): TextSelection | undefined {
  const from = textPlaceOf(rows, anchor);
  const to = textPlaceOf(rows, head);
  return anchor === head || from === undefined || to === undefined
    ? undefined
    : { anchor: from, focus: to };
}

export function paintText(
  painter: Painter,
  {
    owner,
    area,
    text,
    widths,
    typed,
  }: {
    readonly owner: number;
    readonly area: TextArea;
    readonly text: string;
    readonly widths: TextWidths;
    readonly typed?: Typed | undefined;
  },
): void {
  if (area.room <= 0 || area.rows <= 0) {
    return;
  }
  const rows = rowsOf(text, area.wrapAt, widths);
  const place =
    typed === undefined ? undefined : placeOf(rows, typed.head, widths);
  const scroll = scrollOf(place, area);
  painter.text({
    owner,
    column: area.column,
    row: area.row,
    rows: rows.slice(scroll, scroll + area.rows),
    wrapAt: area.wrapAt,
    room: area.room,
    selection: typed === undefined ? undefined : selectionOf(rows, typed),
  });
  if (place !== undefined && place.row - scroll < area.rows) {
    painter.caret({
      start: area.column,
      column: area.column + place.column,
      row: area.row + place.row - scroll,
      cells: place.cells,
      under: place.under,
    });
  }
}

export function paintLine(
  painter: Painter,
  {
    column,
    row,
    text,
    room,
    kind,
    widths,
    typed,
  }: {
    readonly column: number;
    readonly row: number;
    readonly text: string;
    readonly room: number;
    readonly kind: string | undefined;
    readonly widths: TextWidths;
    readonly typed?: Typed | undefined;
  },
): void {
  const [line] = linesOf(text);
  if (line === undefined || room < 0) {
    return;
  }
  const rows = rowsOf(line.text, undefined, widths);
  const width = Math.min(room, Math.ceil(columnsOf(line.text, widths)));
  const owner = painter.nextOwner();
  for (let at = column - 1; at <= column + width; at++) {
    painter.clear(at, row);
    painter.claim(at, row, owner);
  }
  painter.text({
    owner,
    column,
    row,
    rows,
    wrapAt: undefined,
    room: width,
    kind,
    selection: typed === undefined ? undefined : selectionOf(rows, typed),
  });
  const place =
    typed === undefined ? undefined : placeOf(rows, typed.head, widths);
  if (place !== undefined && place.column <= width) {
    painter.caret({
      start: column,
      column: column + place.column,
      row,
      cells: place.cells,
      under: place.under,
    });
  }
}

export function lineWidthOf(text: string, widths: TextWidths): number {
  const [line] = linesOf(text);
  return line === undefined ? 0 : Math.ceil(columnsOf(line.text, widths));
}

function seeCell(
  screen: Screen,
  block: TextBlock,
  { column, row }: { readonly column: number; readonly row: number },
  text: string,
): void {
  const across = block.column + column - screen.column;
  const down = row - screen.row;
  const at = down * screen.columns + across;
  if (
    column < block.room &&
    across >= 0 &&
    across < screen.columns &&
    down >= 0 &&
    down < screen.rows &&
    screen.owners[at] === block.owner
  ) {
    screen.seen[at] = text;
  }
}

export function seeTexts(screen: Screen, widths: TextWidths): void {
  for (const block of screen.texts) {
    for (const [index, row] of block.rows.entries()) {
      const at = block.row + index;
      const cells = seenCells(widths, row.row.text, row);
      for (const [place, { column, text }] of cells.entries()) {
        const next = cells[place + 1]?.column ?? Math.ceil(column + 1);
        for (let cell = column; cell < next; cell++) {
          seeCell(
            screen,
            block,
            { column: cell, row: at },
            cell === column || text === ' ' ? text : '',
          );
        }
      }
      if (row.breakAt !== undefined) {
        seeCell(
          screen,
          block,
          { column: row.breakAt, row: at },
          strings.symbols.breaks,
        );
      }
    }
  }
}
