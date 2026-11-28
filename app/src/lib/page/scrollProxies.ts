import {
  setColumnScroller,
  setRowScroller,
  setStoodFor,
  wheeledAround,
} from './scrollbarLinks';
import { shortestThumb } from './scrollbarParts';

export interface Shown {
  readonly at: number;
  readonly length: number;
}

export interface ProxyHeld {
  readonly onDrag: (share: number) => void;
  readonly onLetGo: () => void;
  readonly onStep: (steps: number) => void;
}

export interface ScrollProxy {
  readonly show: (shown: Shown | undefined) => void;
  readonly stop: () => void;
}

type Axis = 'vertical' | 'horizontal';

export function proxyRatio(shown: Shown | undefined, long: number): number {
  if (shown === undefined || shown.length >= 1) {
    return 1;
  }
  const longest = Math.max(1, long / shortestThumb);
  return 1 / Math.max(shown.length, 1 / longest);
}

export function proxyScroll(shown: Shown | undefined, room: number): number {
  if (shown === undefined || room <= 0) {
    return 0;
  }
  return shown.at >= 1 ? room + 1 : Math.max(0, shown.at) * room;
}

export function proxyShare(scrolled: number, room: number): number {
  if (room <= 0) {
    return 0;
  }
  return scrolled >= room - 1 ? 1 : Math.max(0, scrolled / room);
}

export function proxyElements(axis: Axis): {
  readonly frame: HTMLElement;
  readonly element: HTMLElement;
} {
  const frame = document.createElement('div');
  frame.className = `scroll-proxy-frame ${axis}`;
  const element = document.createElement('div');
  element.className = `scroll-proxy ${axis}`;
  const size = document.createElement('div');
  size.className = 'scroll-proxy-size';
  element.append(size);
  frame.append(element);
  return { frame, element };
}

export function scrollProxy(
  element: HTMLElement,
  axis: Axis,
  held: ProxyHeld,
  view?: () => Element | null | undefined,
): ScrollProxy {
  const size = element.querySelector<HTMLElement>('.scroll-proxy-size');
  let shown: Shown | undefined;
  let ratio = 0;
  let long = 0;
  let room: number | undefined;
  let placed = 0;
  let pointed = false;
  const scrolled = () =>
    axis === 'vertical' ? element.scrollTop : element.scrollLeft;
  const roomNow = () =>
    axis === 'vertical'
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth;
  const place = () => {
    const next = proxyRatio(shown, long);
    if (next !== ratio) {
      ratio = next;
      size?.style.setProperty(
        axis === 'vertical' ? 'height' : 'width',
        `${ratio * 100}%`,
      );
      room = undefined;
    }
    room ??= roomNow();
    if (pointed) {
      return;
    }
    const wanted = proxyScroll(shown, room);
    if (axis === 'vertical') {
      element.scrollTop = wanted;
    } else {
      element.scrollLeft = wanted;
    }
    placed = scrolled();
  };
  const measure = () => {
    long = axis === 'vertical' ? element.clientHeight : element.clientWidth;
    room = undefined;
    place();
  };
  const dragTo = (native: number) => {
    held.onDrag(proxyShare(native, room ?? roomNow()));
  };
  const onWheel = (event: WheelEvent) => {
    for (const turn of wheeledAround(element)) {
      if (!event.defaultPrevented) {
        turn(event);
      }
    }
    event.preventDefault();
  };
  let strayed = false;
  const onScroll = () => {
    const now = scrolled();
    if (Math.abs(now - placed) > 1) {
      placed = now;
      strayed = true;
      dragTo(now);
    }
  };
  const letGo = () => held.onLetGo();
  const onScrollEnd = () => {
    if (strayed) {
      strayed = false;
      letGo();
      place();
    }
  };
  const link = axis === 'vertical' ? setRowScroller : setColumnScroller;
  const scrollTo = (native: number) => {
    if (axis === 'vertical') {
      element.scrollTop = native;
    } else {
      element.scrollLeft = native;
    }
    placed = scrolled();
  };
  link(element, {
    dragTo: (native) => {
      pointed = true;
      scrollTo(native);
      dragTo(native);
    },
    dragEnd: () => {
      pointed = false;
      letGo();
      place();
    },
    stepBy: (steps) => {
      held.onStep(steps);
      return true;
    },
  });
  setStoodFor(element, view);
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('scroll', onScroll, { passive: true });
  element.addEventListener('scrollend', onScrollEnd);
  measure();
  return {
    show: (next) => {
      if (next?.at !== shown?.at || next?.length !== shown?.length) {
        shown = next;
        place();
      }
    },
    stop: () => {
      link(element, undefined);
      setStoodFor(element, undefined);
      observer.disconnect();
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('scrollend', onScrollEnd);
    },
  };
}
