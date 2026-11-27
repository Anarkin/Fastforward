import { wheeledAlone } from '../shared/keymap';
import { listMoveOf, type ListMove } from './listMoves';
import { holdRest } from './scrollSettings';
import { alongLine, gliderOf } from './glide';
import {
  setRowScroller,
  setWheeled,
  type HeldScroller,
} from './scrollbarLinks';
import { notchesOf, onRow, wheelTurn } from './wheelTurns';

export function snappedTop(top: number, row: number, max: number): number {
  if (row <= 0) {
    return top;
  }
  return Math.max(0, Math.min(max, Math.ceil(top / row - onRow) * row));
}

const farViews = 2;

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

export interface RowFollower extends HeldScroller {
  readonly aim: () => number;
  readonly end: () => number;
  readonly glidingTo: () => number | undefined;
  readonly scrollTo: (top: number, glides: boolean) => void;
  readonly reveals: () => void;
  readonly stop: () => void;
}

export function followRows(
  element: HTMLElement,
  rowHeight: () => number,
  {
    keys = false,
    limit = () => element.scrollHeight - element.clientHeight,
    step = rowHeight,
    perNotch = () => 1,
    smooth = () => false,
    settles = () => true,
    onPlace = () => {},
    snapTo,
  }: {
    readonly keys?: boolean;
    readonly limit?: () => number;
    readonly step?: () => number;
    readonly perNotch?: () => number;
    readonly smooth?: () => boolean;
    readonly settles?: () => boolean;
    readonly onPlace?: (top: number) => void;
    readonly snapTo?: (top: number, toward: number, max: number) => number;
  } = {},
): RowFollower {
  let pending = 0;
  let placed: number | undefined;
  let held = false;
  let heldFrom = 0;
  let heldAt: number | undefined;
  let rest: ReturnType<typeof setTimeout> | undefined;
  let seen = element.scrollTop;
  const max = () => Math.max(0, limit());
  const snap = (top: number, toward = 0) =>
    snapTo === undefined
      ? snappedTop(top, rowHeight(), max())
      : snapTo(top, toward, max());
  const toEnd = (top: number) =>
    top > 0 && max() > 0 && top >= max() - 1 ? max() + 1 : top;
  const place = (top: number) => {
    element.scrollTop = toEnd(top);
    placed = element.scrollTop;
    seen = placed;
    onPlace(placed);
  };
  const glider = gliderOf(place, alongLine);
  const settle = glider.settle;
  const scrollTo = (top: number, glides: boolean) => {
    heldAt = undefined;
    const to = Math.max(0, Math.min(max(), top));
    if (!glides || !smooth()) {
      settle();
      place(to);
      return;
    }
    const target = snap(to);
    const away = target - element.scrollTop;
    const view = element.clientHeight;
    if (Math.abs(away) > farViews * view) {
      settle();
      place(target - Math.sign(away) * view);
    }
    glider.glideTo(target, element.scrollTop);
  };
  const aim = () => glider.target() ?? element.scrollTop;
  const reveals = () => {
    if (!smooth()) {
      return;
    }
    const from = element.scrollTop;
    const aimed = glider.target();
    if (aimed !== undefined) {
      element.scrollTop = aimed;
    }
    queueMicrotask(() => {
      const to = element.scrollTop;
      const away = to - from;
      if (Math.abs(away) <= onRow) {
        return;
      }
      const view = element.clientHeight;
      place(
        Math.abs(away) > farViews * view ? to - Math.sign(away) * view : from,
      );
      scrollTo(to, true);
    });
  };
  const hold = (top: number) => {
    clearTimeout(rest);
    rest = undefined;
    if (!held) {
      heldFrom = element.scrollTop;
    }
    held = true;
    settle();
    place(Math.max(0, Math.min(max(), top)));
    heldAt = element.scrollTop;
  };
  const letGo = () => {
    clearTimeout(rest);
    rest = undefined;
    if (!held) {
      return;
    }
    held = false;
    const top = element.scrollTop;
    const snapped =
      top < heldFrom ? snap(Math.max(0, top - rowHeight()), -1) : snap(top, 1);
    if (Math.abs(snapped - top) <= onRow) {
      return;
    }
    if (settles()) {
      scrollTo(snapped, true);
    }
  };
  const dragTo = (top: number) => {
    if (smooth()) {
      hold(top);
    } else {
      scrollTo(snap(top), false);
    }
  };
  const onWheel = (event: WheelEvent) => {
    const row = rowHeight();
    if (!wheeledAlone(event) || event.deltaY === 0 || row <= 0) {
      return;
    }
    event.preventDefault();
    if (smooth() && notchesOf(event) === undefined && event.deltaMode === 0) {
      hold(element.scrollTop + event.deltaY);
      rest = setTimeout(letGo, holdRest);
      return;
    }
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
    if (held) {
      seen = element.scrollTop;
      return;
    }
    if (glider.target() !== undefined) {
      if (placed !== undefined && Math.abs(element.scrollTop - placed) <= 1) {
        return;
      }
      settle();
    }
    const scrolled = element.scrollTop;
    if (heldAt !== undefined && Math.abs(scrolled - heldAt) <= 1) {
      seen = scrolled;
      return;
    }
    heldAt = undefined;
    const snapped = snap(scrolled, Math.sign(scrolled - seen));
    if (Math.abs(snapped - scrolled) > onRow) {
      element.scrollTop = toEnd(snapped);
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
    scrollTo(snap(snap(aim()) + rows * row, Math.sign(rows)), true);
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('scroll', onScroll, {
    passive: true,
    capture: true,
  });
  const stepBy = (steps: number) => {
    const row = rowHeight();
    if (row > 0) {
      scrollTo(snap(snap(aim()) + steps * row, Math.sign(steps)), true);
    }
    return row > 0;
  };
  setRowScroller(element, { dragTo, dragEnd: letGo, stepBy });
  setWheeled(element, 'rows', onWheel);
  if (keys) {
    element.addEventListener('keydown', onKeyDown);
  }
  return {
    aim,
    end: max,
    glidingTo: glider.target,
    scrollTo,
    reveals,
    dragTo,
    dragEnd: letGo,
    stepBy,
    stop: () => {
      clearTimeout(rest);
      settle();
      setRowScroller(element, undefined);
      setWheeled(element, 'rows', undefined);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('scroll', onScroll, { capture: true });
      element.removeEventListener('keydown', onKeyDown);
    },
  };
}
