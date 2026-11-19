import { glideAt, glideEnded, type Glide } from './glide';
import { rowGlide } from './rowScroll';
import { holdRest } from './scrollSettings';
import {
  setColumnScroller,
  setWheeled,
  type HeldScroller,
} from './scrollbarLinks';
import { wheelTurn } from './wheelTurns';

const onColumn = 0.01;

export function snappedLeft(
  left: number,
  advance: number,
  room: number,
): number {
  const end = Math.max(0, room);
  const snapped = advance > 0 ? Math.round(left / advance) * advance : left;
  return Math.max(0, Math.min(end, snapped));
}

type SidewaysWheel = WheelEvent & {
  readonly wheelDeltaX?: number;
  readonly wheelDeltaY?: number;
};

export interface ColumnFollower extends HeldScroller {
  readonly scrollTo: (left: number, glides: boolean) => void;
  readonly stop: () => void;
}

export function followColumns(
  element: HTMLElement,
  {
    turned,
    advance,
    perNotch,
    smooth,
    settles = () => true,
    scrolled = () => element.scrollLeft,
    room = () => element.scrollWidth - element.clientWidth,
    scrollTo = (left) => {
      element.scrollLeft = left;
    },
  }: {
    readonly turned: (event: WheelEvent) => boolean;
    readonly advance: () => number;
    readonly perNotch: () => number;
    readonly smooth: () => boolean;
    readonly settles?: () => boolean;
    readonly scrolled?: () => number;
    readonly room?: () => number;
    readonly scrollTo?: (left: number) => void;
  },
): ColumnFollower {
  let pending = 0;
  let swiped = 0;
  let glide: Glide | undefined;
  let frame: number | undefined;
  let held = false;
  let rest: ReturnType<typeof setTimeout> | undefined;
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
    scrollTo(glideAt(glide, now));
    if (glideEnded(glide, now)) {
      glide = undefined;
    } else {
      frame = requestAnimationFrame(animate);
    }
  };
  const moveTo = (left: number, glides: boolean) => {
    const to = snappedLeft(left, advance(), room());
    if (!glides || !smooth()) {
      settle();
      scrollTo(to);
      return;
    }
    const now = performance.now();
    glide = {
      from: glide ? glideAt(glide, now) : scrolled(),
      to,
      start: now,
      duration: rowGlide,
      power: 2,
    };
    frame ??= requestAnimationFrame(animate);
  };
  const hold = (left: number) => {
    clearTimeout(rest);
    rest = undefined;
    held = true;
    settle();
    scrollTo(Math.max(0, Math.min(Math.max(0, room()), left)));
  };
  const letGo = () => {
    clearTimeout(rest);
    rest = undefined;
    if (!held) {
      return;
    }
    held = false;
    const snapped = snappedLeft(scrolled(), advance(), room());
    if (settles() && Math.abs(snapped - scrolled()) > onColumn) {
      moveTo(snapped, true);
    }
  };
  const dragTo = (left: number) => {
    if (smooth()) {
      hold(left);
    } else {
      moveTo(left, false);
    }
  };
  const onWheel = (event: SidewaysWheel) => {
    const column = advance();
    if (column <= 0) {
      return;
    }
    if (turned(event)) {
      const delta = event.deltaX || event.deltaY;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      const turn = wheelTurn(
        pending,
        {
          deltaY: delta,
          deltaMode: event.deltaMode,
          wheelDeltaY: event.wheelDeltaX || event.wheelDeltaY,
        },
        {
          row: column,
          step: column,
          page: element.clientWidth,
          perNotch: perNotch(),
        },
      );
      pending = turn.pending;
      if (turn.rows !== 0) {
        moveTo((glide?.to ?? scrolled()) + turn.rows * column, true);
      }
      return;
    }
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      return;
    }
    event.preventDefault();
    if (smooth()) {
      hold(scrolled() + event.deltaX);
      rest = setTimeout(letGo, holdRest);
      return;
    }
    const turn = wheelTurn(
      swiped,
      { deltaY: event.deltaX, deltaMode: event.deltaMode },
      { row: column, step: column, page: element.clientWidth, perNotch: 1 },
    );
    swiped = turn.pending;
    if (turn.rows !== 0) {
      moveTo(scrolled() + turn.rows * column, false);
    }
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  const stepBy = (steps: number) => {
    const column = advance();
    if (column > 0) {
      moveTo((glide?.to ?? scrolled()) + steps * column, true);
    }
    return column > 0;
  };
  setColumnScroller(element, { dragTo, dragEnd: letGo, stepBy });
  setWheeled(element, 'columns', onWheel);
  return {
    scrollTo: moveTo,
    dragTo,
    dragEnd: letGo,
    stepBy,
    stop: () => {
      clearTimeout(rest);
      settle();
      element.removeEventListener('wheel', onWheel);
      setColumnScroller(element, undefined);
      setWheeled(element, 'columns', undefined);
    },
  };
}
