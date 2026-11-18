import type { ScrollerMetrics } from './scrollbarGeometry';

export type ScrollbarDrag = 'thumb' | 'track';

export const scrollbarDrags = new WeakMap<Element, ScrollbarDrag>();

export interface HeldScroller {
  readonly dragTo: (place: number) => void;
  readonly dragEnd: () => void;
}

export interface SidewaysScroller {
  readonly metrics: () => ScrollerMetrics;
  readonly scrollTo: (scrollLeft: number) => void;
  readonly dragEnd: () => void;
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

const columnScrollers = new WeakMap<Element, HeldScroller>();

export function setColumnScroller(
  element: Element,
  scroller: HeldScroller | undefined,
): void {
  if (scroller) {
    columnScrollers.set(element, scroller);
  } else {
    columnScrollers.delete(element);
  }
}

export function columnScrollerOf(element: Element): HeldScroller | undefined {
  return columnScrollers.get(element);
}

const rowScrollers = new WeakMap<Element, HeldScroller>();

export function setRowScroller(
  element: Element,
  scroller: HeldScroller | undefined,
): void {
  if (scroller) {
    rowScrollers.set(element, scroller);
  } else {
    rowScrollers.delete(element);
  }
}

export function rowScrollerOf(element: Element): HeldScroller | undefined {
  return rowScrollers.get(element);
}
