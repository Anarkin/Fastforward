import { checkSize, checkStart } from './lineCheck';
import type { LinePointed } from './lineRecords';

export interface ScrolledList {
  readonly clientLeft: number;
  readonly clientTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  getBoundingClientRect(): {
    readonly left: number;
    readonly top: number;
  };
}

function lineAt(
  list: ScrolledList,
  { x, y }: { readonly x: number; readonly y: number },
  line: number,
  count: number,
): LinePointed | undefined {
  if (!(line > 0)) {
    return undefined;
  }
  const box = list.getBoundingClientRect();
  const across = x - box.left - list.clientLeft;
  const down = y - box.top - list.clientTop;
  if (
    across < 0 ||
    down < 0 ||
    across >= list.clientWidth ||
    down >= list.clientHeight
  ) {
    return undefined;
  }
  const index = Math.floor((down + list.scrollTop) / line);
  if (index < 0 || index >= count) {
    return undefined;
  }
  const within = down + list.scrollTop - index * line - (line - checkSize) / 2;
  const fromStart = across - checkStart;
  return {
    index,
    overCheck:
      fromStart >= 0 &&
      fromStart < checkSize &&
      within >= 0 &&
      within < checkSize,
  };
}

export function lineBoxOf(
  list: ScrolledList,
  index: number,
  line: number,
): { readonly left: number; readonly top: number; readonly bottom: number } {
  const box = list.getBoundingClientRect();
  const top = box.top + list.clientTop + index * line - list.scrollTop;
  return { left: box.left + list.clientLeft, top, bottom: top + line };
}

export interface Located {
  readonly index: number;
  readonly overCheck: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function locatedLine(
  list: ScrolledList,
  at: { readonly x: number; readonly y: number },
  line: number,
  count: number,
): Located | undefined {
  const found = lineAt(list, at, line, count);
  return found === undefined
    ? undefined
    : {
        ...found,
        left: 0,
        top: found.index * line,
        width: list.clientWidth,
        height: line,
      };
}

export interface TileGrid {
  readonly height: number;
  readonly width: number;
  readonly across: number;
  readonly count: number;
  readonly check: {
    readonly left: number;
    readonly top: number;
    readonly size: number;
  };
}

export function locatedTile(
  list: ScrolledList,
  { x, y }: { readonly x: number; readonly y: number },
  { height, width, across, count, check }: TileGrid,
): Located | undefined {
  if (!(height > 0) || !(width > 0)) {
    return undefined;
  }
  const box = list.getBoundingClientRect();
  const inRow = x - box.left - list.clientLeft;
  const down = y - box.top - list.clientTop;
  if (
    inRow < 0 ||
    down < 0 ||
    inRow >= list.clientWidth ||
    down >= list.clientHeight
  ) {
    return undefined;
  }
  const row = Math.floor((down + list.scrollTop) / height);
  const column = Math.floor(inRow / width);
  const index = row * across + column;
  if (column >= across || index < 0 || index >= count) {
    return undefined;
  }
  const inside = inRow - column * width - check.left;
  const below = down + list.scrollTop - row * height - check.top;
  return {
    index,
    overCheck:
      inside >= 0 && inside < check.size && below >= 0 && below < check.size,
    left: column * width,
    top: row * height,
    width,
    height,
  };
}
