import type { FindRange } from './find';
import { tabSize } from './wordWrap';

export interface Columns {
  readonly first: number;
  readonly last: number;
}

export interface HiddenChanges {
  readonly left: FindRange | undefined;
  readonly right: FindRange | undefined;
}

export function textColumn(text: string, index: number): number {
  let column = 0;
  for (let at = 0; at < index; at++) {
    column += text[at] === '\t' ? tabSize - (column % tabSize) : 1;
  }
  return column;
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
  let left: FindRange | undefined;
  let right: FindRange | undefined;
  for (const word of words) {
    if (word.start === word.end) {
      continue;
    }
    if (textColumn(text, word.end) <= first) {
      left = word;
    } else if (textColumn(text, word.start) >= last) {
      right ??= word;
    }
  }
  return { left, right };
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
const markerRoom = 18;

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

export function revealChange(
  view: Sideways,
  area: TextArea,
  text: string,
  word: FindRange,
  charWidth: number,
): number {
  return revealScroll(
    area.origin + textColumn(text, word.start) * charWidth,
    area.origin + textColumn(text, word.end) * charWidth,
    area.visible,
    view.room,
  );
}
