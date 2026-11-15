import { useEffect, useState } from 'react';

export function sidewaysDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
}

export function stripOverflows(
  overflowing: boolean,
  scrollWidth: number,
  clientWidth: number,
  padding: number,
): boolean {
  return overflowing
    ? scrollWidth - 2 * padding > clientWidth + 1
    : scrollWidth > clientWidth + 1;
}

export function tabsWidth(
  tabs: readonly {
    readonly offsetLeft: number;
    readonly offsetWidth: number;
    readonly marginRight: number;
  }[],
): number {
  const first = tabs.at(0);
  const last = tabs.at(-1);
  return first && last
    ? last.offsetLeft + last.offsetWidth + last.marginRight - first.offsetLeft
    : 0;
}

export function revealingScroll(
  view: { readonly scrolled: number; readonly width: number },
  tab: { readonly start: number; readonly end: number },
  reach: number,
): number {
  const start = tab.start - reach;
  const end = tab.end + reach;
  if (start < view.scrolled) {
    return Math.max(0, start);
  }
  if (end > view.scrolled + view.width) {
    return end - view.width;
  }
  return view.scrolled;
}

export function useOverflowing(
  strip: React.RefObject<HTMLElement | null>,
  list: React.RefObject<HTMLElement | null>,
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = strip.current;
    if (!element) {
      return undefined;
    }
    const measure = () => {
      const tabs = [...element.children].filter(
        (child) => child instanceof HTMLElement,
      );
      const ends = [tabs.at(0), tabs.at(-1)].flatMap((tab) =>
        tab
          ? [
              {
                offsetLeft: tab.offsetLeft,
                offsetWidth: tab.offsetWidth,
                marginRight: parseFloat(getComputedStyle(tab).marginRight) || 0,
              },
            ]
          : [],
      );
      const padding = parseFloat(getComputedStyle(element).paddingLeft) || 0;
      const laidOut = tabsWidth(ends);
      setOverflowing((was) =>
        stripOverflows(
          was,
          laidOut + 2 * padding,
          element.clientWidth,
          padding,
        ),
      );
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    if (list.current) {
      resized.observe(list.current);
    }
    const changed = new MutationObserver(measure);
    changed.observe(element, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [strip, list]);
  return overflowing;
}

export function revealTab(strip: HTMLElement | null, index: number): void {
  const tab = strip?.querySelectorAll(':scope > [role="tab"]')[index];
  if (!strip || !tab) {
    return;
  }
  const origin = strip.getBoundingClientRect().left - strip.scrollLeft;
  const { left, right } = tab.getBoundingClientRect();
  strip.scrollLeft = revealingScroll(
    { scrolled: strip.scrollLeft, width: strip.clientWidth },
    { start: left - origin, end: right - origin },
    parseFloat(getComputedStyle(strip).paddingLeft) || 0,
  );
}
