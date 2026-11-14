import type { FindMatch } from './find';
import { rowPlace } from '../../../ui/rowPlace';
import { wheeled, type Modifiers } from '../../../shell/shared/keymap';
import { gitKeymap } from './keymap';
import type { ListMove } from '../../../ui/listMoves';
import { sidewaysColumns } from '../../../ui/rowScroll';
import { inlineArea, revealFound, sideArea, type Sideways } from './overflow';
import type { TextWidths } from '../../../ui/textWidths';
import { type DiffRow, type FileHeaderRow, isChange } from './diffRows';
import { uniformHeight, rowLines } from './rowMeasures';

export function sideScroll(scroll: number, widest: number): number {
  return Math.max(0, Math.min(widest, scroll));
}

export const wheelGlide = 120;

export function wheelSideways(
  event: Modifiers & Pick<WheelEvent, 'deltaX' | 'deltaY'>,
): { delta: number; duration: number } {
  if (wheeled(gitKeymap.wheelSideways, event)) {
    return { delta: event.deltaX || event.deltaY, duration: wheelGlide };
  }
  return {
    delta: Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0,
    duration: 0,
  };
}

export function diffScrollLeft(
  step: 1 | -1,
  scrolled: number,
  room: number | undefined,
  advance: number,
): number | undefined {
  const by = sidewaysColumns * advance;
  if (step === -1 && scrolled > 0) {
    return Math.max(0, scrolled - by);
  }
  if (step === 1 && room !== undefined && scrolled < room) {
    return Math.min(room, scrolled + by);
  }
  return undefined;
}

export function diffScrollTop(
  move: ListMove,
  scrollTop: number,
  viewport: number,
  total: number,
  line = uniformHeight,
): number | undefined {
  const bottom = Math.max(0, total - viewport);
  let target: number;
  switch (move) {
    case 'down':
      target = scrollTop + line;
      break;
    case 'up':
      target = scrollTop - line;
      break;
    case 'pageDown':
      target = scrollTop + Math.max(line, viewport - line);
      break;
    case 'pageUp':
      target = scrollTop - Math.max(line, viewport - line);
      break;
    case 'first':
      target = 0;
      break;
    case 'last':
      target = bottom;
      break;
  }
  return Math.max(0, Math.min(bottom, target));
}

export function changeStarts(rows: readonly DiffRow[]): number[] {
  return rows.flatMap((row, index) =>
    isChange(row) && !isChange(rows[index - 1]) ? [index] : [],
  );
}

export function changeMargin(lineHeight: number): number {
  return (rowLines.file + 2) * lineHeight;
}

export function changeScrollTop(
  starts: readonly number[],
  scrollTop: number,
  step: 1 | -1,
  margin: number,
): number | undefined {
  const targets = starts.map((start) => Math.max(0, start - margin));
  const target =
    step > 0
      ? targets.find((top) => top > scrollTop + 1)
      : targets.findLast((top) => top < scrollTop - 1);
  return target;
}

export function keyedScrollTop(
  step: 1 | -1 | undefined,
  move: ListMove | undefined,
  scrolled: number,
  viewport: number,
  total: number,
  lineHeight: number,
  changeTops: () => readonly number[],
): number | undefined {
  if (step !== undefined) {
    return changeScrollTop(
      changeTops(),
      scrolled,
      step,
      changeMargin(lineHeight),
    );
  }
  return move && diffScrollTop(move, scrolled, viewport, total, lineHeight);
}

export function firstChangeTop(
  starts: readonly number[],
  margin: number,
): number | undefined {
  const [first] = starts;
  return first === undefined ? undefined : Math.max(0, first - margin);
}

export function scrollOnToggle(
  rows: readonly DiffRow[],
  row: FileHeaderRow,
  stuck: boolean,
): number | undefined {
  return stuck ? fileHeaderIndex(rows, row.file) : undefined;
}

export function rowAnchors(
  rows: readonly DiffRow[],
  lines: readonly (readonly string[])[],
): (readonly string[])[] {
  const hunks = new Map<number, number>();
  return rows.map((row, index) => {
    if (lines[index].length > 0) {
      return lines[index];
    }
    if (row.kind === 'hunk') {
      const hunk = (hunks.get(row.file) ?? 0) + 1;
      hunks.set(row.file, hunk);
      return [`${row.file}:hunk:${hunk}`];
    }
    return ['file' in row ? `${row.file}:${row.kind}` : row.kind];
  });
}

export interface ScrollAnchor {
  readonly shows: readonly string[];
  readonly fraction: number;
}

type Laid = readonly { readonly start: number; readonly size: number }[];

export function scrollAnchor(
  rows: Laid,
  shown: readonly (readonly string[])[],
  scrollTop: number,
): ScrollAnchor | undefined {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].start <= scrollTop) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const row = rows.at(low);
  const shows = shown.at(low);
  if (!row || !shows) {
    return undefined;
  }
  return {
    shows,
    fraction: row.size > 0 ? (scrollTop - row.start) / row.size : 0,
  };
}

export function anchoredScrollTop(
  anchor: ScrollAnchor,
  rows: Laid,
  shown: readonly (readonly string[])[],
): number | undefined {
  const index = shown.findIndex((shows) =>
    shows.some((id) => anchor.shows.includes(id)),
  );
  const row = index === -1 ? undefined : rows.at(index);
  return (
    row &&
    row.start + Math.min(anchor.fraction * row.size, Math.max(0, row.size - 1))
  );
}

export function stuckHeader(
  rows: readonly DiffRow[],
  items: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
): FileHeaderRow | undefined {
  const top = items.find((item) => item.end > scrollTop);
  if (top === undefined) {
    return undefined;
  }
  const topRow = rows[top.index];
  if (
    !('file' in topRow) ||
    (topRow.kind === 'file' && top.start >= scrollTop)
  ) {
    return undefined;
  }
  const header = rows[fileHeaderIndex(rows, topRow.file)];
  return header?.kind === 'file' ? header : undefined;
}

export function foundScroll(
  row: DiffRow,
  found: FindMatch,
  view: Sideways,
  widths: TextWidths,
): number | undefined {
  switch (row.kind) {
    case 'line':
      return revealFound(
        view,
        inlineArea(view, 2),
        row.line.text,
        found,
        widths,
      );
    case 'wholeLine':
      return revealFound(view, inlineArea(view, 1), row.text, found, widths);
    case 'split': {
      const right = row.right?.index === found.line;
      const cell = right ? row.right : row.left;
      return (
        cell &&
        revealFound(view, sideArea(view, right), cell.line.text, found, widths)
      );
    }
    default:
      return undefined;
  }
}

export function foundMiddle(
  found: Edges,
  view: Edges,
  row: { readonly top: number; readonly start: number },
): number | undefined {
  if (found.top >= view.top && found.bottom <= view.bottom) {
    return undefined;
  }
  return row.start + (found.top + found.bottom) / 2 - row.top;
}

export function foundEdges(element: Element): Edges | undefined {
  const marks = Array.from(
    element.querySelectorAll('mark.find-match.current'),
    (mark) => mark.getBoundingClientRect(),
  );
  return marks.length === 0
    ? undefined
    : {
        top: Math.min(...marks.map((mark) => mark.top)),
        bottom: Math.max(...marks.map((mark) => mark.bottom)),
      };
}

export function sideRoom(element: HTMLElement): {
  side: number;
  widest: number;
} {
  const codes = Array.from(
    element.querySelectorAll<HTMLElement>('.split-code'),
  );
  return {
    side: codes.at(0)?.clientWidth ?? 0,
    widest: Math.max(
      0,
      ...codes.map(
        (code) =>
          (code.firstElementChild instanceof HTMLElement
            ? code.firstElementChild.offsetWidth
            : 0) - code.clientWidth,
      ),
    ),
  };
}

function fileHeaderIndex(rows: readonly DiffRow[], file: number): number {
  return rows.findIndex((row) => row.kind === 'file' && row.file === file);
}

export function diffRowPlace(
  start: number,
  height: number | undefined,
): React.CSSProperties {
  return { ...rowPlace(start, height), '--diff-row-top': `${start}px` };
}

export interface Edges {
  readonly top: number;
  readonly bottom: number;
}
