import { rowWidths, type TabSizeOf } from './fileWidths';
import type { FindRange } from './find';
import type { DiffRow } from './rows';
import { columnsAlong } from '../../cells/page/columns';
import { type TextWidths } from '../../../lib/page/textWidths';
import { codePadding } from './textLayout';

export function textColumn(
  text: string,
  index: number,
  widths?: TextWidths,
): number {
  return columnsAlong(text, widths)(index);
}

export function widestColumns(
  rows: readonly DiffRow[],
  widths?: TextWidths,
  tabSizeOf?: TabSizeOf,
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
    const rowWidthsShown = widths && rowWidths(widths, tabSizeOf, row);
    for (const text of texts) {
      widest = Math.max(widest, textColumn(text, text.length, rowWidthsShown));
    }
  }
  return widest;
}

export function revealScroll(
  start: number,
  end: number,
  width: number,
  room: number,
): number {
  return Math.max(0, Math.min(room, (start + end) / 2 - width / 2));
}

export interface Sideways {
  readonly scrolled: number;
  readonly width: number;
  readonly room: number;
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
): number {
  return columns > 0
    ? Math.max(0, 2 * codePadding + Math.ceil(columns * charWidth) - width)
    : 0;
}

export interface TextArea {
  readonly origin: number;
  readonly visible: number;
}

export function sideArea(view: Sideways): TextArea {
  return { origin: codePadding, visible: view.width };
}

function textSpan(
  area: TextArea,
  text: string,
  range: FindRange,
  widths: TextWidths,
): { start: number; end: number } {
  const columnAt = columnsAlong(text, widths);
  return {
    start: area.origin + columnAt(range.start) * widths.char,
    end: area.origin + columnAt(range.end) * widths.char,
  };
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
