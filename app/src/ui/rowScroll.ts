import { createContext } from 'react';
import { pressedAlone } from '../shell/shared/keymap';
import { listMoveOf, type ListMove } from './listMoves';
import { glideAt, glideEnded, type Glide } from './glide';
import { setRowScroller } from './overlayScrollbars';

const onRow = 0.01;
const lineMode = 1;
const pageMode = 2;
const notch = 120;

export function snappedTop(top: number, row: number, max: number): number {
  if (row <= 0) {
    return top;
  }
  return Math.max(0, Math.min(max, Math.ceil(top / row - onRow) * row));
}

export interface ScrollSettings {
  readonly wheelRows: number;
  readonly smooth: boolean;
}

export const Scrolling = createContext<ScrollSettings>({
  wheelRows: 1,
  smooth: false,
});

export const rowGlide = 100;

export function glideRows(
  glide: Glide | undefined,
  scrolled: number,
  now: number,
  to: number,
): Glide {
  return {
    from: glide ? glideAt(glide, now) : scrolled,
    to,
    start: now,
    duration: rowGlide,
  };
}

export function revealGlides(
  from: number,
  to: number,
  row: number,
  page: number,
): boolean {
  const distance = Math.abs(to - from);
  return distance > row + onRow && distance <= page + onRow;
}

export interface Wheel {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly wheelDeltaY?: number;
}

export interface WheelSizes {
  readonly row: number;
  readonly step: number;
  readonly page: number;
  readonly perNotch: number;
}

export function notchesOf({
  deltaY,
  wheelDeltaY = 0,
}: Wheel): number | undefined {
  return deltaY !== 0 && wheelDeltaY !== 0 && wheelDeltaY % notch === 0
    ? (Math.sign(deltaY) * Math.abs(wheelDeltaY)) / notch
    : undefined;
}

export function wheelTurn(
  pending: number,
  wheel: Wheel,
  { row, step, page, perNotch }: WheelSizes,
): { readonly rows: number; readonly pending: number } {
  const notches = notchesOf(wheel);
  if (notches !== undefined) {
    return { rows: notches * perNotch, pending: 0 };
  }
  const { deltaY, deltaMode } = wheel;
  const pixels =
    deltaMode === lineMode
      ? deltaY * step
      : deltaMode === pageMode
        ? ((deltaY * page) / row) * step
        : deltaY;
  const total = pending + pixels;
  const rows = Math.trunc(total / step + (total > 0 ? onRow : -onRow));
  const left = total - rows * step;
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

export interface RowFollower {
  readonly aim: () => number;
  readonly scrollTo: (top: number, glides: boolean) => void;
  readonly stop: () => void;
}

const isPage = (move: ListMove) => move === 'pageUp' || move === 'pageDown';

export function followRows(
  element: HTMLElement,
  rowHeight: () => number,
  {
    keys = false,
    limit = () => element.scrollHeight - element.clientHeight,
    step = rowHeight,
    perNotch = () => 1,
    smooth = () => false,
    onPlace = () => {},
  }: {
    readonly keys?: boolean;
    readonly limit?: () => number;
    readonly step?: () => number;
    readonly perNotch?: () => number;
    readonly smooth?: () => boolean;
    readonly onPlace?: (top: number) => void;
  } = {},
): RowFollower {
  let pending = 0;
  let glide: Glide | undefined;
  let frame: number | undefined;
  let placed: number | undefined;
  const max = () => Math.max(0, limit());
  const place = (top: number) => {
    element.scrollTop = top;
    placed = element.scrollTop;
    onPlace(placed);
  };
  const settle = () => {
    glide = undefined;
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
  const animate = () => {
    frame = undefined;
    if (!glide) {
      return;
    }
    const now = performance.now();
    place(glideAt(glide, now));
    if (glideEnded(glide, now)) {
      glide = undefined;
    } else {
      frame = requestAnimationFrame(animate);
    }
  };
  const scrollTo = (top: number, glides: boolean) => {
    const to = Math.max(0, Math.min(max(), top));
    if (!glides || !smooth()) {
      settle();
      place(to);
      return;
    }
    glide = glideRows(
      glide,
      element.scrollTop,
      performance.now(),
      snappedTop(to, rowHeight(), max()),
    );
    frame ??= requestAnimationFrame(animate);
  };
  const aim = () => glide?.to ?? element.scrollTop;
  const onWheel = (event: WheelEvent) => {
    const row = rowHeight();
    if (!pressedAlone(event) || event.deltaY === 0 || row <= 0) {
      return;
    }
    event.preventDefault();
    const turned = wheelTurn(pending, event, {
      row,
      step: step() > 0 ? step() : row,
      page: element.clientHeight,
      perNotch: perNotch(),
    });
    pending = turned.pending;
    if (turned.rows !== 0) {
      scrollTo(snappedTop(aim(), row, max()) + turned.rows * row, true);
    }
  };
  const onScroll = () => {
    if (glide) {
      if (placed !== undefined && Math.abs(element.scrollTop - placed) <= 1) {
        return;
      }
      settle();
    }
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
    scrollTo(
      snappedTop(aim(), row, max()) + moveSteps[move](page) * row,
      isPage(move),
    );
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('scroll', onScroll, { passive: true });
  setRowScroller(element, (top) =>
    scrollTo(snappedTop(top, rowHeight(), max()), true),
  );
  if (keys) {
    element.addEventListener('keydown', onKeyDown);
  }
  return {
    aim,
    scrollTo,
    stop: () => {
      settle();
      setRowScroller(element, undefined);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('keydown', onKeyDown);
    },
  };
}
