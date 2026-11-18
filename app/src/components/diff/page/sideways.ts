import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { afterPaint } from '../../../lib/page/afterPaint';
import { followColumns } from '../../../lib/page/columnScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { elementMetrics } from '../../../lib/page/scrollerMetrics';
import {
  setSidewaysScroller,
  sidewaysScrollEvent,
} from '../../../lib/page/scrollbarLinks';
import { sidewaysMetrics, sidewaysScroll } from './sidewaysMetrics';
import {
  sideRoom,
  sideScroll,
  swipedSideways,
  wheelsSideways,
} from './sidewaysScroll';
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

export function useSideways(
  listRef: RefObject<HTMLDivElement | null>,
  scrollsSides: boolean,
  wordWrap: boolean,
  sideways: number,
  setSideways: (sideways: number) => void,
  advance: number,
  scrolling: ScrollSettings,
): {
  readonly measured: Sideways | undefined;
  readonly measureSideways: () => void;
} {
  const scrolledSideways = useRef(sideways);
  const advanceNow = useEffectEvent(() => advance);
  const perNotch = useEffectEvent(() => scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  const [measured, setMeasured] = useState<Sideways>();
  useEffect(() => {
    const element = listRef.current;
    if (!element || wordWrap) {
      return undefined;
    }
    if (!scrollsSides) {
      return followColumns(element, {
        turned: wheelsSideways,
        advance: advanceNow,
        perNotch,
        smooth,
      });
    }
    const following = followColumns(element, {
      turned: wheelsSideways,
      advance: advanceNow,
      perNotch,
      smooth,
      scrolled: () => scrolledSideways.current,
      room: () => sideRoom(element).widest,
      scrollTo: setSideways,
    });
    const onWheel = (event: WheelEvent) => {
      const delta = swipedSideways(event);
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      setSideways(
        sideScroll(scrolledSideways.current + delta, sideRoom(element).widest),
      );
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
      following();
      element.removeEventListener('wheel', onWheel);
      setSidewaysScroller(element, undefined);
    };
  }, [listRef, scrollsSides, wordWrap, setSideways]);
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
  return { measured, measureSideways };
}
