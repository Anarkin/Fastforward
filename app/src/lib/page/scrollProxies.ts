import {
  setColumnScroller,
  setRowScroller,
  setStoodFor,
  wheeledAround,
} from './scrollbarLinks';

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

const longest = 4000;

export function proxyRatio(shown: Shown | undefined): number {
  return shown === undefined || shown.length >= 1
    ? 1
    : Math.min(longest, 1 / Math.max(shown.length, 1 / longest));
}

export function proxyScroll(shown: Shown | undefined, long: number): number {
  return shown === undefined
    ? 0
    : Math.max(0, Math.min(1, shown.at)) * long * (proxyRatio(shown) - 1);
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
  view?: Element,
): ScrollProxy {
  const size = element.querySelector<HTMLElement>('.scroll-proxy-size');
  let shown: Shown | undefined;
  let long = 0;
  let placed = 0;
  const scrolled = () =>
    axis === 'vertical' ? element.scrollTop : element.scrollLeft;
  const place = () => {
    size?.style.setProperty(
      axis === 'vertical' ? 'height' : 'width',
      `${proxyRatio(shown) * 100}%`,
    );
    placed = proxyScroll(shown, long);
    if (axis === 'vertical') {
      element.scrollTop = placed;
    } else {
      element.scrollLeft = placed;
    }
  };
  const measure = () => {
    long = axis === 'vertical' ? element.clientHeight : element.clientWidth;
    place();
  };
  const dragTo = (native: number) => {
    const range = long * (proxyRatio(shown) - 1);
    held.onDrag(range > 0 ? Math.max(0, Math.min(1, native / range)) : 0);
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
    }
  };
  const link = axis === 'vertical' ? setRowScroller : setColumnScroller;
  link(element, { dragTo, dragEnd: letGo, stepBy: held.onStep });
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
