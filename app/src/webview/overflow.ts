import type { FindRange } from './find';
import { tabStop } from './wordWrap';

export interface Columns {
  readonly first: number;
  readonly last: number;
}

export interface HiddenChanges {
  readonly left: FindRange | undefined;
  readonly right: FindRange | undefined;
}

function columnsOf(text: string): (index: number) => number {
  let at = 0;
  let column = 0;
  let tab = text.indexOf('\t');
  return (index) => {
    while (tab !== -1 && tab < index) {
      column = tabStop(column + tab - at);
      at = tab + 1;
      tab = text.indexOf('\t', at);
    }
    column += index - at;
    at = index;
    return column;
  };
}

export function textColumn(text: string, index: number): number {
  return columnsOf(text)(index);
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
): HiddenChanges {
  const columnAt = columnsOf(text);
  let left: FindRange | undefined;
  for (const word of words) {
    if (word.start === word.end) {
      continue;
    }
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

export const numberWidth = 56;
export const codePadding = 6;
export const markerWidth = 14;
export const markerInset = 2;
const markerRoom = markerInset + markerWidth + markerInset;

export interface Sideways {
  readonly scrolled: number;
  readonly width: number;
  readonly room: number;
  readonly minimap: number;
}

export function shownSideways(
  measured: Sideways,
  scrollsSides: boolean,
  sideways: number,
): Sideways {
  return scrollsSides ? { ...measured, scrolled: sideways } : measured;
}

export interface TextArea {
  readonly origin: number;
  readonly visible: number;
}

export function inlineArea(view: Sideways, numbers: number): TextArea {
  return {
    origin: numbers * numberWidth + codePadding,
    visible: view.width - view.minimap,
  };
}

export function lineWidth(
  columns: number,
  numbers: number,
  charWidth: number,
): number {
  return (
    numbers * numberWidth + 2 * codePadding + Math.ceil(columns * charWidth)
  );
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
  charWidth: number,
): { start: number; end: number } {
  const columnAt = columnsOf(text);
  return {
    start: area.origin + columnAt(range.start) * charWidth,
    end: area.origin + columnAt(range.end) * charWidth,
  };
}

export function revealChange(
  view: Sideways,
  area: TextArea,
  text: string,
  word: FindRange,
  charWidth: number,
): number {
  const { start, end } = textSpan(area, text, word, charWidth);
  return revealScroll(start, end, area.visible, view.room);
}

export function revealFound(
  view: Sideways,
  area: TextArea,
  text: string,
  found: FindRange,
  charWidth: number,
): number {
  const { start, end } = textSpan(area, text, found, charWidth);
  return start >= view.scrolled && end <= view.scrolled + area.visible
    ? view.scrolled
    : revealScroll(start, end, area.visible, view.room);
}
