import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { type VirtualizerOptions } from '@tanstack/react-virtual';
import { type ScrollTarget } from '../shared/protocol';

const scrolledDelay = 150;

export function workingTreeShift(
  scrollTop: number,
  shiftBy: number,
  rowHeight: number,
): number | undefined {
  return scrollTop === 0 ? undefined : scrollTop + shiftBy * rowHeight;
}

export interface ListScrollState {
  readonly target: ScrollTarget | undefined;
  readonly offset: number;
}

export type ListScroll = { target: ScrollTarget } | { shiftBy: number };

export function listScroll(
  previous: ListScrollState,
  next: ListScrollState,
): ListScroll | undefined {
  if (next.target !== undefined && next.target !== previous.target) {
    return { target: next.target };
  }
  return next.offset === previous.offset
    ? undefined
    : { shiftBy: next.offset - previous.offset };
}

export function keptPlace(
  start: number,
  offset: number,
  scrollTop: number,
  reportedTop: number | undefined,
  maxTop = Infinity,
): number {
  const pulledUp =
    reportedTop !== undefined && scrollTop < reportedTop && scrollTop >= maxTop;
  return (
    start +
    offset +
    (reportedTop === undefined || pulledUp ? 0 : scrollTop - reportedTop)
  );
}

let reports = 0;

export class ReportedPlaces {
  private readonly tops = new Map<number, number>();

  told(top: number): number {
    reports += 1;
    this.tops.set(reports, top);
    return reports;
  }

  kept(
    start: number,
    offset: number,
    scrollTop: number,
    report: number | undefined,
    maxTop?: number,
  ): number {
    const top = keptPlace(
      start,
      offset,
      scrollTop,
      report === undefined ? undefined : this.tops.get(report),
      maxTop,
    );
    if (report !== undefined && this.tops.has(report)) {
      const moved = top - scrollTop;
      for (const [told, at] of this.tops) {
        if (told < report) {
          this.tops.delete(told);
        } else {
          this.tops.set(told, at + moved);
        }
      }
    }
    return top;
  }

  moved(by: number): void {
    for (const [told, at] of this.tops) {
      this.tops.set(told, at + by);
    }
  }

  forget(): void {
    this.tops.clear();
  }
}

export function movingPlaces<T extends Element>(
  places: ReportedPlaces,
  scrollToFn: VirtualizerOptions<T, Element>['scrollToFn'],
): VirtualizerOptions<T, Element>['scrollToFn'] {
  return (offset, options, instance) => {
    places.moved(options.adjustments ?? 0);
    scrollToFn(offset, options, instance);
  };
}

export function trailing(
  run: () => void,
  delay: number,
): { schedule: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      run();
    }
  };
  return {
    schedule: () => {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
  };
}

export function useScrollReports(
  list: RefObject<HTMLElement | null>,
  topNow: () => (() => boolean) | undefined,
): () => void {
  const topUnreported = useRef(false);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    topUnreported.current = false;
    let reportTop = () => true;
    const report = trailing(() => {
      topUnreported.current = !reportTop();
    }, scrolledDelay);
    const scrolled = () => {
      const top = topNow();
      if (top) {
        reportTop = top;
        report.schedule();
      }
    };
    element.addEventListener('scroll', scrolled);
    return () => {
      report.flush();
      element.removeEventListener('scroll', scrolled);
    };
  }, [list, topNow]);
  return useCallback(() => {
    const reportTop = topUnreported.current ? topNow() : undefined;
    if (reportTop) {
      topUnreported.current = !reportTop();
    }
  }, [topNow]);
}

export function atMostEvery(
  run: () => void,
  delay: number,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let again = false;
  const cool = () => {
    timer = setTimeout(() => {
      timer = undefined;
      if (again) {
        again = false;
        run();
        cool();
      }
    }, delay);
  };
  return {
    schedule: () => {
      if (timer === undefined) {
        run();
        cool();
      } else {
        again = true;
      }
    },
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
      again = false;
    },
  };
}
