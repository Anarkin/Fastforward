import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { afterPaint } from './afterPaint';
import { glideAt, glideEnded, type Glide } from './glide';
import { elementMetrics } from './scrollerMetrics';
import { setSidewaysScroller, sidewaysScrollEvent } from './scrollbarLinks';
import { sidewaysMetrics, sidewaysScroll } from './sidewaysMetrics';
import { sideRoom, wheelSideways } from './sidewaysScroll';
import type { Sideways } from './overflow';

export function readSideways(
  element: HTMLElement,
  scrollsSides: boolean,
): Sideways {
  const minimap =
    parseFloat(getComputedStyle(element).getPropertyValue('--minimap-width')) ||
    0;
  if (scrollsSides) {
    const { side, widest } = sideRoom(element);
    return { scrolled: 0, width: side, room: widest, minimap };
  }
  return {
    scrolled: element.scrollLeft,
    width: element.clientWidth,
    room: element.scrollWidth - element.clientWidth,
    minimap,
  };
}

const sameSideways = (a: Sideways | undefined, b: Sideways) =>
  a?.scrolled === b.scrolled &&
  a.width === b.width &&
  a.room === b.room &&
  a.minimap === b.minimap;

export function glideBy(
  glide: Glide | undefined,
  scrolled: number,
  now: number,
  delta: number,
  duration: number,
  widest: number,
): Glide {
  const within = (at: number) => Math.max(0, Math.min(widest, at));
  return {
    from: within(glide ? glideAt(glide, now) : scrolled),
    to: within((glide?.to ?? scrolled) + delta),
    start: now,
    duration,
  };
}

export function useSideways(
  listRef: RefObject<HTMLDivElement | null>,
  scrollsSides: boolean,
  wordWrap: boolean,
): {
  readonly sideways: number;
  readonly setSideways: (sideways: number) => void;
  readonly measured: Sideways | undefined;
  readonly measureSideways: () => void;
} {
  const [sideways, setSideways] = useState(0);
  const scrolledSideways = useRef(sideways);
  const [measured, setMeasured] = useState<Sideways>();
  useEffect(() => {
    const element = listRef.current;
    if (!element || !scrollsSides) {
      return undefined;
    }
    let glide: Glide | undefined;
    let frameWidest: number | undefined;
    let frame: number | undefined;
    const scroll = () => {
      frame = undefined;
      frameWidest = undefined;
      if (!glide) {
        return;
      }
      const now = performance.now();
      setSideways(glideAt(glide, now));
      if (glideEnded(glide, now)) {
        glide = undefined;
      } else {
        frame = requestAnimationFrame(scroll);
      }
    };
    const onWheel = (event: WheelEvent) => {
      const { delta, duration } = wheelSideways(event);
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      frameWidest ??= sideRoom(element).widest;
      glide = glideBy(
        glide,
        scrolledSideways.current,
        performance.now(),
        delta,
        duration,
        frameWidest,
      );
      frame ??= requestAnimationFrame(scroll);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    setSidewaysScroller(element, {
      metrics: () => {
        const { side, widest } = sideRoom(element);
        return sidewaysMetrics(
          elementMetrics(element),
          side,
          widest,
          scrolledSideways.current,
        );
      },
      scrollTo: (scrollLeft) => {
        const { side, widest } = sideRoom(element);
        const left = sidewaysScroll(scrollLeft, element.clientWidth, side);
        setSideways(Math.max(0, Math.min(widest, left)));
      },
    });
    return () => {
      element.removeEventListener('wheel', onWheel);
      setSidewaysScroller(element, undefined);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [listRef, scrollsSides]);
  useEffect(() => {
    if (scrolledSideways.current !== sideways) {
      scrolledSideways.current = sideways;
      listRef.current?.dispatchEvent(new Event(sidewaysScrollEvent));
    }
  }, [listRef, sideways]);
  const measureSideways = useCallback(() => {
    const element = listRef.current;
    if (!element || wordWrap) {
      setMeasured(undefined);
      return;
    }
    const next = readSideways(element, scrollsSides);
    setMeasured((last) => (sameSideways(last, next) ? last : next));
  }, [listRef, wordWrap, scrollsSides]);
  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(measureSideways);
    observer.observe(element);
    const painted = afterPaint(measureSideways);
    element.addEventListener('scroll', painted.ask, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', painted.ask);
      painted.cancel();
    };
  }, [listRef, measureSideways]);
  return { sideways, setSideways, measured, measureSideways };
}
