import { pressedAlone } from '../shared/keymap';
import { listMoveOf, type ListMove } from './listMoves';
import { glideAt, glideEnded, type Glide } from './glide';
import { setRowScroller } from './scrollbarLinks';
import { wheelTurn } from './wheelTurns';

const onRow = 0.01;

export function snappedTop(top: number, row: number, max: number): number {
  if (row <= 0) {
    return top;
  }
  return Math.max(0, Math.min(max, Math.ceil(top / row - onRow) * row));
}

export const rowGlide = 150;

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
    power: 2,
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
    snapTo,
  }: {
    readonly keys?: boolean;
    readonly limit?: () => number;
    readonly step?: () => number;
    readonly perNotch?: () => number;
    readonly smooth?: () => boolean;
    readonly onPlace?: (top: number) => void;
    readonly snapTo?: (top: number, toward: number, max: number) => number;
  } = {},
): RowFollower {
  let pending = 0;
  let glide: Glide | undefined;
  let frame: number | undefined;
  let placed: number | undefined;
  let seen = element.scrollTop;
  const max = () => Math.max(0, limit());
  const snap = (top: number, toward = 0) =>
    snapTo === undefined
      ? snappedTop(top, rowHeight(), max())
      : snapTo(top, toward, max());
  const place = (top: number) => {
    element.scrollTop = top;
    placed = element.scrollTop;
    seen = placed;
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
    glide = glideRows(glide, element.scrollTop, performance.now(), snap(to));
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
      scrollTo(
        snap(snap(aim()) + turned.rows * row, Math.sign(turned.rows)),
        true,
      );
    }
  };
  const onScroll = () => {
    if (glide) {
      if (placed !== undefined && Math.abs(element.scrollTop - placed) <= 1) {
        return;
      }
      settle();
    }
    const scrolled = element.scrollTop;
    const snapped = snap(scrolled, Math.sign(scrolled - seen));
    if (Math.abs(snapped - scrolled) > onRow) {
      element.scrollTop = snapped;
    }
    seen = element.scrollTop;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const move = listMoveOf(event);
    const row = rowHeight();
    if (move === undefined || event.defaultPrevented || row <= 0) {
      return;
    }
    event.preventDefault();
    const page = Math.max(1, Math.floor(element.clientHeight / row) - 1);
    const rows = moveSteps[move](page);
    scrollTo(snap(snap(aim()) + rows * row, Math.sign(rows)), isPage(move));
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('scroll', onScroll, {
    passive: true,
    capture: true,
  });
  setRowScroller(element, (top) => scrollTo(snap(top), true));
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
      element.removeEventListener('scroll', onScroll, { capture: true });
      element.removeEventListener('keydown', onKeyDown);
    },
  };
}
