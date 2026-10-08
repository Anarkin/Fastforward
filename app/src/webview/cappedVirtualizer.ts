import { useLayoutEffect, useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  observeElementOffset,
  type Virtualizer,
} from '@tanstack/react-virtual';
import {
  realHeight,
  scrolled,
  scrolledTo,
  type ScrollAnchor,
  type ScrollRange,
} from './cappedScroll';

export class CappedScroll {
  anchor: ScrollAnchor = { real: 0, base: 0 };
  private drawn = 0;
  private redraw = () => {};
  private refit = () => {};

  drawnAt(shift: number): void {
    this.drawn = shift;
  }

  redrawWith(redraw: () => void): void {
    this.redraw = redraw;
  }

  fitWith(refit: () => void): void {
    this.refit = refit;
  }

  // A list that gets shorter scrolls only once the browser clamps its top
  fit(): boolean {
    this.refit();
    return this.anchor.base !== this.drawn;
  }

  moved(): void {
    if (this.anchor.base !== this.drawn) {
      this.redraw();
    }
  }

  top(element: Element | null): number {
    return (element?.scrollTop ?? 0) + this.anchor.base;
  }
}

function rangeOf(
  instance: { getTotalSize: () => number },
  element: Element,
): ScrollRange {
  return { total: instance.getTotalSize(), viewport: element.clientHeight };
}

export function cappedScrolling<T extends Element>(scroll: CappedScroll) {
  return {
    observeElementOffset: (
      instance: Virtualizer<T, Element>,
      report: (offset: number, isScrolling: boolean) => void,
    ) => {
      Reflect.set(instance, 'getMaxScrollOffset', () => {
        const element = instance.scrollElement;
        const total = instance.getTotalSize();
        return element
          ? element.scrollHeight -
              element.clientHeight +
              total -
              realHeight(total)
          : 0;
      });
      const follow = (real: number, isScrolling: boolean) => {
        const element = instance.scrollElement;
        if (!element) {
          return;
        }
        const next = scrolled(scroll.anchor, real, rangeOf(instance, element));
        scroll.anchor = next;
        if (next.real !== real) {
          element.scrollTop = next.real;
        }
        report(next.real + next.base, isScrolling);
      };
      let total = instance.getTotalSize();
      scroll.fitWith(() => {
        const element = instance.scrollElement;
        if (element && instance.getTotalSize() !== total) {
          total = instance.getTotalSize();
          follow(element.scrollTop, false);
        }
      });
      return observeElementOffset(instance, (real, isScrolling) => {
        follow(real, isScrolling);
        scroll.moved();
      });
    },
    scrollToFn: (
      offset: number,
      {
        adjustments = 0,
        behavior,
      }: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<T, Element>,
    ) => {
      const element = instance.scrollElement;
      if (!element) {
        return;
      }
      const before = scroll.anchor;
      const next = scrolledTo(
        before,
        offset + adjustments,
        rangeOf(instance, element),
      );
      scroll.anchor = next;
      const top = element.scrollTop;
      element.scrollTo({ top: next.real, behavior });
      if (next.base !== before.base && element.scrollTop === top) {
        element.dispatchEvent(new Event('scroll'));
      }
    },
  };
}

export function useCappedScroll<T extends Element>() {
  const [scroll] = useState(() => new CappedScroll());
  const [scrolling] = useState(() => cappedScrolling<T>(scroll));
  const [scrollTop] = useState(
    () => (element: Element | null) => scroll.top(element),
  );
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useLayoutEffect(() => {
    scroll.redrawWith(() => flushSync(redraw));
  }, [scroll]);
  const shift = scroll.anchor.base;
  useLayoutEffect(() => {
    scroll.drawnAt(shift);
  });
  const [fit] = useState(() => () => {
    if (scroll.fit()) {
      redraw();
    }
  });
  return { scrolling, shift, scrollTop, fit };
}
