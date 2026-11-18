import { glideAt, glideEnded, type Glide } from './glide';
import { rowGlide } from './rowScroll';
import { columnWidthOf, setColumnWidth } from './scrollbarLinks';
import { wheelTurn } from './wheelTurns';

export function snappedLeft(
  left: number,
  advance: number,
  room: number,
): number {
  const end = Math.max(0, room);
  const snapped = advance > 0 ? Math.round(left / advance) * advance : left;
  return Math.max(0, Math.min(end, snapped));
}

export function scrollToColumn(element: Element, left: number): void {
  element.scrollLeft = snappedLeft(
    left,
    columnWidthOf(element),
    element.scrollWidth - element.clientWidth,
  );
}

type SidewaysWheel = WheelEvent & {
  readonly wheelDeltaX?: number;
  readonly wheelDeltaY?: number;
};

export function followColumns(
  element: HTMLElement,
  {
    turned,
    advance,
    perNotch,
    smooth,
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
    readonly scrolled?: () => number;
    readonly room?: () => number;
    readonly scrollTo?: (left: number) => void;
  },
): () => void {
  let pending = 0;
  let glide: Glide | undefined;
  let frame: number | undefined;
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
  const onWheel = (event: SidewaysWheel) => {
    const column = advance();
    const delta = event.deltaX || event.deltaY;
    if (!turned(event) || delta === 0 || column <= 0) {
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
    if (turn.rows === 0) {
      return;
    }
    const from = scrolled();
    const to = snappedLeft(
      (glide?.to ?? from) + turn.rows * column,
      column,
      room(),
    );
    if (!smooth()) {
      settle();
      scrollTo(to);
      return;
    }
    const now = performance.now();
    glide = {
      from: glide ? glideAt(glide, now) : from,
      to,
      start: now,
      duration: rowGlide,
      power: 2,
    };
    frame ??= requestAnimationFrame(animate);
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  setColumnWidth(element, advance);
  return () => {
    settle();
    element.removeEventListener('wheel', onWheel);
    setColumnWidth(element, undefined);
  };
}
