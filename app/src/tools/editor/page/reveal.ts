import type { Extension, SelectionRange } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cellAt, gridOf, type GridCell } from './grid';

type Strategy = 'nearest' | 'start' | 'end' | 'center';

interface Revealing {
  readonly x: Strategy;
  readonly y: Strategy;
  readonly xMargin: number;
  readonly yMargin: number;
}

interface Span {
  readonly from: number;
  readonly to: number;
}

const hair = 0.01;

export function movedInto(
  shown: Span,
  wanted: Span,
  how: Strategy,
  margin: number,
  side: number,
): number {
  const room = shown.to - shown.from;
  if (how !== 'nearest') {
    const size = wanted.to - wanted.from;
    const start =
      how === 'center' && size <= room
        ? wanted.from + size / 2 - room / 2
        : how === 'start' || (how === 'center' && side < 0)
          ? wanted.from - margin
          : wanted.to - room + margin;
    return start - shown.from;
  }
  if (wanted.from < shown.from - hair) {
    const back = wanted.from - (shown.from + margin);
    return side > 0 && wanted.to > shown.to + back
      ? wanted.to - shown.to + margin
      : back;
  }
  if (wanted.to > shown.to + hair) {
    const on = wanted.to - shown.to + margin;
    return side < 0 && wanted.from - on < shown.from
      ? wanted.from - (shown.from + margin)
      : on;
  }
  return 0;
}

function marginsOf(view: EditorView): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  let left = parseFloat(getComputedStyle(view.contentDOM).marginLeft) || 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (const source of view.state.facet(EditorView.scrollMargins)) {
    const margins = source(view);
    left = Math.max(left, margins?.left ?? 0);
    right = Math.max(right, margins?.right ?? 0);
    top = Math.max(top, margins?.top ?? 0);
    bottom = Math.max(bottom, margins?.bottom ?? 0);
  }
  return { left, right, top, bottom };
}

const united = (one: GridCell, other: GridCell): GridCell => {
  const left = Math.min(one.left, other.left);
  const top = Math.min(one.top, other.top);
  return {
    left,
    top,
    width: Math.max(one.left + one.width, other.left + other.width) - left,
    height: Math.max(one.top + one.height, other.top + other.height) - top,
  };
};

const within = (margin: number, room: number) =>
  Math.max(Math.min(margin, room), -room);

function revealOnGrid(
  view: EditorView,
  range: SelectionRange,
  { x, y, xMargin, yMargin }: Revealing,
): boolean {
  const grid = gridOf(view);
  if (grid === undefined) {
    return false;
  }
  const head = cellAt(
    view,
    grid,
    range.head,
    range.empty ? range.assoc || 1 : range.head > range.anchor ? -1 : 1,
  );
  const cell = range.empty
    ? head
    : united(
        head,
        cellAt(view, grid, range.anchor, range.anchor > range.head ? -1 : 1),
      );
  const scroller = view.scrollDOM;
  const box = scroller.getBoundingClientRect();
  const margins = marginsOf(view);
  const side = range.head < range.anchor ? -1 : 1;
  const down = movedInto(
    { from: box.top, to: box.top + scroller.clientHeight },
    {
      from: cell.top - margins.top,
      to: cell.top + cell.height + margins.bottom,
    },
    y,
    within(yMargin, box.height),
    side,
  );
  const across = view.lineWrapping
    ? 0
    : movedInto(
        { from: box.left, to: box.left + scroller.clientWidth },
        {
          from: cell.left - margins.left,
          to: cell.left + cell.width + margins.right,
        },
        x,
        within(xMargin, box.width),
        side,
      );
  if (down !== 0) {
    scroller.scrollTop += down;
  }
  if (across !== 0) {
    scroller.scrollLeft += across;
  }
  return true;
}

export const gridReveal: Extension = EditorView.scrollHandler.of(revealOnGrid);
