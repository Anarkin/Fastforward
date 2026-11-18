import type { FindRange } from './find';
import type { DiffRow } from './rows';
import { columnsOf } from '../../../lib/page/textColumns';
import { type TextWidths } from '../../../lib/page/textWidths';
import { codePadding, markerInset, markerWidth } from './textLayout';

export interface Columns {
  readonly first: number;
  readonly last: number;
}

export interface HiddenChanges {
  readonly left: FindRange | undefined;
  readonly right: FindRange | undefined;
}

export function textColumn(
  text: string,
  index: number,
  widths?: TextWidths,
): number {
  return columnsOf(text, widths)(index);
}

export function widestColumns(
  rows: readonly DiffRow[],
  widths?: TextWidths,
): number {
  let widest = 0;
  for (const row of rows) {
    const texts =
      row.kind === 'line'
        ? [row.line.text]
        : row.kind === 'wholeLine'
          ? [row.text]
          : row.kind === 'split'
            ? [row.left?.line.text ?? '', row.right?.line.text ?? '']
            : [];
    for (const text of texts) {
      widest = Math.max(widest, textColumn(text, text.length, widths));
    }
  }
  return widest;
}

export function visibleColumns(
  scrolled: number,
  width: number,
  charWidth: number,
): Columns | undefined {
  return charWidth > 0
    ? { first: scrolled / charWidth, last: (scrolled + width) / charWidth }
    : undefined;
}

export function hiddenChanges(
  text: string,
  words: readonly FindRange[],
  { first, last }: Columns,
  widths: TextWidths,
): HiddenChanges {
  const columnAt = columnsOf(text, widths);
  let left: FindRange | undefined;
  for (const word of words) {
    const start = columnAt(word.start);
    if (columnAt(word.end) <= first) {
      left = word;
    } else if (start >= last) {
      return { left, right: word };
    }
  }
  return { left, right: undefined };
}

export function revealScroll(
  start: number,
  end: number,
  width: number,
  room: number,
): number {
  return Math.max(0, Math.min(room, (start + end) / 2 - width / 2));
}

const markerRoom = markerInset + markerWidth + markerInset;

export interface Sideways {
  readonly scrolled: number;
  readonly width: number;
  readonly room: number;
  readonly minimap: number;
}

const dotStretch = 128;
const dotStretches = 2;
const dotsLeft = dotStretch / 2;

export function dottedColumns(
  view: Sideways | undefined,
  charWidth: number,
  last?: readonly [number, number],
): readonly [number, number] | undefined {
  if (view === undefined || !(charWidth > 0)) {
    return undefined;
  }
  const first = view.scrolled / charWidth;
  const end = (view.scrolled + view.width) / charWidth;
  if (last && first - dotsLeft >= last[0] && end + dotsLeft <= last[1]) {
    return last;
  }
  return [
    (Math.floor(first / dotStretch) - dotStretches) * dotStretch,
    (Math.ceil(end / dotStretch) + dotStretches) * dotStretch,
  ];
}

export function sidewaysRoom(
  columns: number,
  charWidth: number,
  width: number,
  minimap: number,
): number {
  return Math.max(
    0,
    2 * codePadding + Math.ceil(columns * charWidth) + minimap - width,
  );
}

export interface TextArea {
  readonly origin: number;
  readonly visible: number;
}

export function sideArea(view: Sideways, last: boolean): TextArea {
  return {
    origin: codePadding,
    visible: view.width - (last ? view.minimap : 0),
  };
}

export function areaColumns(
  view: Sideways,
  area: TextArea,
  charWidth: number,
): Columns | undefined {
  const columns = visibleColumns(
    view.scrolled - area.origin + markerRoom,
    area.visible - 2 * markerRoom,
    charWidth,
  );
  return (
    columns && {
      first: view.scrolled > 0 ? columns.first : -Infinity,
      last: view.scrolled < view.room ? columns.last : Infinity,
    }
  );
}

function textSpan(
  area: TextArea,
  text: string,
  range: FindRange,
  widths: TextWidths,
): { start: number; end: number } {
  const columnAt = columnsOf(text, widths);
  return {
    start: area.origin + columnAt(range.start) * widths.char,
    end: area.origin + columnAt(range.end) * widths.char,
  };
}

export function revealChange(
  view: Sideways,
  area: TextArea,
  text: string,
  word: FindRange,
  widths: TextWidths,
): number {
  const { start, end } = textSpan(area, text, word, widths);
  return revealScroll(start, end, area.visible, view.room);
}

export function revealFound(
  view: Sideways,
  area: TextArea,
  text: string,
  found: FindRange,
  widths: TextWidths,
): number {
  const { start, end } = textSpan(area, text, found, widths);
  return start >= view.scrolled && end <= view.scrolled + area.visible
    ? view.scrolled
    : revealScroll(start, end, area.visible, view.room);
}
