import type { ScrollerMetrics } from './scrollbarGeometry';

export type ScrollbarDrag = 'thumb' | 'track';

export const scrollbarDrags = new WeakMap<Element, ScrollbarDrag>();

export interface SidewaysScroller {
  readonly metrics: () => ScrollerMetrics;
  readonly scrollTo: (scrollLeft: number) => void;
}

const sidewaysScrollers = new WeakMap<Element, SidewaysScroller>();

export const sidewaysScrollEvent = 'sidewaysscroll';

export function setSidewaysScroller(
  element: Element,
  scroller: SidewaysScroller | undefined,
): void {
  if (scroller) {
    sidewaysScrollers.set(element, scroller);
  } else {
    sidewaysScrollers.delete(element);
  }
}

export function sidewaysScrollerOf(
  element: Element,
): SidewaysScroller | undefined {
  return sidewaysScrollers.get(element);
}

const columnWidths = new WeakMap<Element, () => number>();

export function setColumnWidth(
  element: Element,
  width: (() => number) | undefined,
): void {
  if (width) {
    columnWidths.set(element, width);
  } else {
    columnWidths.delete(element);
  }
}

export function columnWidthOf(element: Element): number {
  return columnWidths.get(element)?.() ?? 0;
}

const rowScrollers = new WeakMap<Element, (scrollTop: number) => void>();

export function setRowScroller(
  element: Element,
  dragTo: ((scrollTop: number) => void) | undefined,
): void {
  if (dragTo) {
    rowScrollers.set(element, dragTo);
  } else {
    rowScrollers.delete(element);
  }
}

export function rowScrollerOf(
  element: Element,
): ((scrollTop: number) => void) | undefined {
  return rowScrollers.get(element);
}
