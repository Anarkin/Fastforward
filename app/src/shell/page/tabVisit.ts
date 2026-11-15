import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type StripPlace,
  type TabInfo,
  type TabVisit,
} from '../shared/protocol';
import { nearestSlot, slide, slotLefts } from './tabDrag';

export function visitedSlot(
  widths: readonly number[],
  gap: number,
  left: number,
): { readonly index: number; readonly shift: number } {
  const lefts = slotLefts([...widths, 0], gap, widths.length);
  const clamped = Math.min(Math.max(left, 0), lefts.at(-1) ?? 0);
  const index = nearestSlot(lefts, clamped);
  return { index, shift: clamped - (lefts[index] ?? 0) };
}

export function useVisitorSlides(
  elements: React.RefObject<Map<string, HTMLElement>>,
  visitor: string | undefined,
): void {
  const places = useRef(
    new Map<string, { readonly laid: number; readonly drawn: number }>(),
  );
  const visited = useRef<string>(undefined);
  useLayoutEffect(() => {
    const before = places.current;
    if (visitor !== undefined) {
      for (const [id, element] of elements.current) {
        const was = before.get(id);
        if (
          id !== visitor &&
          id !== visited.current &&
          was !== undefined &&
          was.laid !== element.offsetLeft
        ) {
          slide(element, was.drawn);
        }
      }
    }
    visited.current = visitor;
    places.current = new Map(
      [...elements.current].map(([id, element]) => [
        id,
        {
          laid: element.offsetLeft,
          drawn: element.getBoundingClientRect().left,
        },
      ]),
    );
  });
}

export function useVisit(
  strip: React.RefObject<HTMLDivElement | null>,
  elements: React.RefObject<Map<string, HTMLElement>>,
  tabs: readonly TabInfo[],
  visit: TabVisit | undefined,
  onIndex: (index: number) => void,
): readonly TabInfo[] {
  const [index, setIndex] = useState<number>();
  const visited = useRef<string>(undefined);
  const shifted = useRef<HTMLElement>(undefined);
  const others = useMemo(
    () => (visit ? tabs.filter((tab) => tab.id !== visit.tab.id) : tabs),
    [tabs, visit],
  );
  useLayoutEffect(() => {
    const row = strip.current;
    const left = visited.current;
    if (left !== undefined && left !== visit?.tab.id) {
      visited.current = undefined;
      const element = shifted.current;
      shifted.current = undefined;
      if (element !== undefined) {
        const from = element.getBoundingClientRect().left;
        element.style.transform = '';
        slide(element, from);
      }
    }
    if (visit === undefined || row === null) {
      setIndex(undefined);
      return;
    }
    visited.current = visit.tab.id;
    const style = getComputedStyle(row);
    const origin =
      row.getBoundingClientRect().left +
      (parseFloat(style.paddingLeft) || 0) -
      row.scrollLeft;
    const widths = others.map(
      (tab) => elements.current.get(tab.id)?.offsetWidth ?? 0,
    );
    const visitor = elements.current.get(visit.tab.id);
    const { index: to, shift } = visitedSlot(
      widths,
      parseFloat(style.columnGap) || 0,
      visit.x - visit.grabX - origin,
    );
    if (to !== index) {
      setIndex(to);
      onIndex(to);
    } else if (visitor !== undefined) {
      visitor.style.transform = `translateX(${shift}px)`;
      shifted.current = visitor;
    }
  }, [strip, elements, others, visit, index, onIndex]);
  return visit === undefined
    ? tabs
    : others.toSpliced(index ?? others.length, 0, visit.tab);
}

export function useStripReport(
  bar: React.RefObject<HTMLElement | null>,
  list: React.RefObject<HTMLElement | null>,
  strip: React.RefObject<HTMLElement | null>,
  report: (strip: StripPlace) => void,
): void {
  const told = useRef<string>(undefined);
  useEffect(() => {
    const measure = () => {
      const nav = bar.current?.getBoundingClientRect();
      const area = list.current?.getBoundingClientRect();
      const row = strip.current;
      if (nav === undefined || area === undefined || !row) {
        return;
      }
      const first = row.querySelector('[role="tab"]');
      const tab = first?.getBoundingClientRect();
      const place: StripPlace = {
        left: area.left,
        right: area.right,
        top: nav.top,
        bottom: nav.bottom,
        firstTabLeft:
          tab?.left ??
          row.getBoundingClientRect().left +
            (parseFloat(getComputedStyle(row).paddingLeft) || 0),
        tabTop: tab?.top ?? nav.top,
        tabs: row.querySelectorAll('[role="tab"]').length,
      };
      const json = JSON.stringify(place);
      if (json !== told.current) {
        told.current = json;
        report(place);
      }
    };
    measure();
    const resized = new ResizeObserver(measure);
    for (const element of [bar.current, list.current, strip.current]) {
      if (element) {
        resized.observe(element);
      }
    }
    const changed = new MutationObserver(measure);
    if (strip.current) {
      changed.observe(strip.current, { childList: true });
    }
    window.addEventListener('resize', measure);
    return () => {
      resized.disconnect();
      changed.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bar, list, strip, report]);
}
