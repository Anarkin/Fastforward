import type { Sentence } from '../../../lib/shared/strings';
import { followDrag } from '../../../lib/page/followDrag';
import { workingTreeHash } from '../shared/protocol';

export const minColumnWidths = [275, 150];
export const minLastColumnWidth = 240;

export function shownSelection(
  selected: string | undefined,
  workingTree: number | undefined,
): string | undefined {
  return selected === workingTreeHash && !workingTree ? undefined : selected;
}

export function columnsClass(
  commitsShown: boolean,
  selected: string | undefined,
  diffShown = true,
): string {
  return [
    'columns',
    ...(commitsShown ? [] : ['commits-hidden']),
    ...(selected === undefined ? ['nothing-selected'] : []),
    ...(diffShown ? [] : ['no-changes']),
  ].join(' ');
}

export function showsDiff(
  error: Sentence | undefined,
  listsNothing: boolean,
): boolean {
  return error !== undefined || !listsNothing;
}

export function listError(
  error: Sentence | undefined,
  selected: string | undefined,
): Sentence | undefined {
  return selected === undefined ? error : undefined;
}

export function templateOf(
  widths: readonly number[],
  hidden: readonly boolean[],
): string {
  return `${widths.map((width, i) => (hidden[i] ? '0px' : `minmax(${minColumnWidths[i]}px, ${width}px)`)).join(' ')} minmax(${minLastColumnWidth}px, 1fr)`;
}

export function widthsToLoad(
  saved: readonly number[],
  defaults: readonly number[],
): readonly number[] {
  return saved.length === defaults.length ? saved : defaults;
}

export function maxWidth(
  widths: readonly number[],
  hidden: readonly boolean[],
  index: number,
  viewWidth: number,
  spacing: number,
): number {
  const others = widths.reduce(
    (sum, width, i) => (i === index || hidden[i] ? sum : sum + width),
    0,
  );
  return Math.max(
    minColumnWidths[index],
    viewWidth - spacing - others - minLastColumnWidth,
  );
}

export function drawnWidths(
  widths: readonly number[],
  hidden: readonly boolean[],
  tracks: string,
): number[] {
  const drawn = tracks.split(' ').map(parseFloat);
  return widths.map((width, i) =>
    hidden[i] || drawn[i] > width - 0.5
      ? width
      : Math.max(minColumnWidths[i], Math.floor(drawn[i])),
  );
}

export function draggedWidths(
  start: readonly number[],
  index: number,
  delta: number,
  max: number,
): number[] {
  const width = Math.round(
    Math.min(max, Math.max(minColumnWidths[index], start[index] + delta)),
  );
  return start.map((w, i) => (i === index ? width : w));
}

export function resetWidth(
  widths: readonly number[],
  index: number,
  defaults: readonly number[],
): number[] {
  return widths.map((width, i) => (i === index ? defaults[i] : width));
}

export function dragColumn(
  event: {
    readonly pointerId: number;
    readonly clientX: number;
    readonly currentTarget: HTMLElement;
    readonly preventDefault: () => void;
  },
  index: number,
  widths: readonly number[],
  hidden: readonly boolean[],
  resized: (widths: readonly number[]) => void,
): void {
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const grid = event.currentTarget.closest<HTMLElement>('.columns');
  const style = grid ? getComputedStyle(grid) : undefined;
  const startWidths = style
    ? drawnWidths(widths, hidden, style.gridTemplateColumns)
    : widths;
  const max = maxWidth(
    startWidths,
    hidden,
    index,
    grid?.clientWidth ?? Infinity,
    style
      ? parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.columnGap) * startWidths.length
      : 0,
  );
  let current = widths;
  followDrag(
    window,
    (move: PointerEvent) => {
      current = draggedWidths(startWidths, index, move.clientX - startX, max);
      if (grid) {
        grid.style.gridTemplateColumns = templateOf(current, hidden);
      }
    },
    () => {
      document.body.classList.remove('resizing');
      resized(current);
    },
  );
  document.body.classList.add('resizing');
}
