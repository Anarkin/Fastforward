import { useEffect, useEffectEvent } from 'react';
import { followRows } from './rowScroll';
import {
  endPaddingToStart,
  snappedToStart,
  startsBelowCover,
} from './rowStarts';
import type { ScrollSettings } from './scrollSettings';

const nearStart = 0.5;

export interface ListBox {
  readonly top: number;
  readonly scrolled: number;
  readonly scrollPaddingTop: string;
}

export function startsOfRows(
  list: ListBox,
  rowTops: readonly number[],
): number[] {
  return startsBelowCover(
    rowTops.map((top) => top - list.top + list.scrolled),
    Number.parseFloat(list.scrollPaddingTop) || 0,
  );
}

export function rowStep(heights: readonly number[]): number {
  const drawn = heights.filter((height) => height > 0);
  return drawn.length === 0 ? 0 : Math.min(...drawn);
}

function followWholeRows(
  element: HTMLElement,
  rows: string,
  settings: { readonly perNotch: () => number; readonly smooth: () => boolean },
): () => void {
  const view = element.ownerDocument.defaultView ?? window;
  const styleOf = () => view.getComputedStyle(element);
  const ownPadding = Number.parseFloat(styleOf().paddingBottom) || 0;
  const inlinePadding = element.style.paddingBottom;
  let padding = 0;
  const rowsShown = () => [...element.querySelectorAll<HTMLElement>(rows)];
  const starts = () =>
    startsOfRows(
      {
        top:
          element.getBoundingClientRect().top +
          (Number.parseFloat(styleOf().borderTopWidth) || 0),
        scrolled: element.scrollTop,
        scrollPaddingTop: styleOf().scrollPaddingTop,
      },
      rowsShown().map((row) => row.getBoundingClientRect().top),
    );
  const following = followRows(
    element,
    () => rowStep(rowsShown().map((row) => row.getBoundingClientRect().height)),
    {
      ...settings,
      snapTo: (top, toward, max) => {
        const shown = starts();
        return snappedToStart(
          (index) => shown[index],
          shown.length,
          top,
          toward,
          max,
          nearStart,
        );
      },
    },
  );
  const pad = () => {
    const shown = starts();
    const needed = endPaddingToStart(
      (index) => shown[index],
      shown.length,
      element.scrollHeight - padding,
      element.clientHeight,
    );
    if (Math.abs(needed - padding) >= nearStart) {
      padding = needed;
      element.style.paddingBottom = `${ownPadding + padding}px`;
    }
  };
  pad();
  const resized = new ResizeObserver(pad);
  resized.observe(element);
  const changed = new view.MutationObserver(pad);
  changed.observe(element, { childList: true, subtree: true });
  return () => {
    following.stop();
    resized.disconnect();
    changed.disconnect();
    element.style.paddingBottom = inlinePadding;
  };
}

export function useWholeRows(
  element: React.RefObject<HTMLElement | null>,
  rows: string | undefined,
  scrolling: ScrollSettings,
): void {
  const perNotch = useEffectEvent(() => scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  useEffect(() => {
    const scroller = element.current;
    return scroller && rows !== undefined
      ? followWholeRows(scroller, rows, { perNotch, smooth })
      : undefined;
  }, [element, rows]);
}
