import { pressedAlone } from '../shell/shared/keymap';
import { listMoveOf, type ListMove } from './listMoves';

const onRow = 0.01;
const lineMode = 1;
const pageMode = 2;

export function snappedTop(top: number, row: number, max: number): number {
  if (row <= 0) {
    return top;
  }
  return Math.max(0, Math.min(max, Math.ceil(top / row - onRow) * row));
}

export function wheelRows(
  pending: number,
  delta: number,
  mode: number,
  row: number,
  page: number,
): { readonly rows: number; readonly pending: number } {
  const pixels =
    mode === lineMode ? delta * row : mode === pageMode ? delta * page : delta;
  const total = pending + pixels;
  const rows = Math.trunc(total / row + (total > 0 ? onRow : -onRow));
  const left = total - rows * row;
  return { rows, pending: Math.abs(left) < onRow ? 0 : left };
}

export function rowPadding(viewport: number, row: number): number {
  if (row <= 0) {
    return 0;
  }
  const over = viewport % row;
  return over < onRow || row - over < onRow ? 0 : over;
}

const moveSteps: Readonly<Record<ListMove, (page: number) => number>> = {
  up: () => -1,
  down: () => 1,
  pageUp: (page) => -page,
  pageDown: (page) => page,
  first: () => -Infinity,
  last: () => Infinity,
};

export function followRows(
  element: HTMLElement,
  rowHeight: () => number,
  {
    keys = false,
    limit = () => element.scrollHeight - element.clientHeight,
  }: { readonly keys?: boolean; readonly limit?: () => number } = {},
): () => void {
  let pending = 0;
  const max = () => Math.max(0, limit());
  const goTo = (top: number) => {
    element.scrollTop = Math.max(0, Math.min(max(), top));
  };
  const onWheel = (event: WheelEvent) => {
    const row = rowHeight();
    if (!pressedAlone(event) || event.deltaY === 0 || row <= 0) {
      return;
    }
    event.preventDefault();
    const turned = wheelRows(
      pending,
      event.deltaY,
      event.deltaMode,
      row,
      element.clientHeight,
    );
    pending = turned.pending;
    if (turned.rows !== 0) {
      goTo(snappedTop(element.scrollTop, row, max()) + turned.rows * row);
    }
  };
  const onScroll = () => {
    const snapped = snappedTop(element.scrollTop, rowHeight(), max());
    if (Math.abs(snapped - element.scrollTop) > onRow) {
      element.scrollTop = snapped;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const move = listMoveOf(event);
    const row = rowHeight();
    if (move === undefined || event.defaultPrevented || row <= 0) {
      return;
    }
    event.preventDefault();
    const page = Math.max(1, Math.floor(element.clientHeight / row) - 1);
    goTo(
      snappedTop(element.scrollTop, row, max()) + moveSteps[move](page) * row,
    );
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('scroll', onScroll, { passive: true });
  if (keys) {
    element.addEventListener('keydown', onKeyDown);
  }
  return () => {
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('scroll', onScroll);
    element.removeEventListener('keydown', onKeyDown);
  };
}
