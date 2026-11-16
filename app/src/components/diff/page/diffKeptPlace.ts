import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { useRestore } from '../../../lib/page/restore';
import { anchoredScrollTop, scrollAnchor } from './diffScrollAnchor';
import type { DiffPlace } from './diffPlace';

const placeWithin = 10_000;

export function useKeptPlace({
  list,
  place,
  onPlace,
  settled,
  virtualizer,
  anchors,
  scrollsSides,
  sideways,
  reveal,
  toggled,
}: {
  readonly list: RefObject<HTMLDivElement | null>;
  readonly place: DiffPlace | undefined;
  readonly onPlace: ((change: Partial<DiffPlace>) => void) | undefined;
  readonly settled: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly anchors: readonly (readonly string[])[];
  readonly scrollsSides: boolean;
  readonly sideways: number;
  readonly reveal: (scrolled: number) => void;
  readonly toggled: ReadonlyMap<string, boolean>;
}): void {
  const restoring = useRestore(
    place,
    () => settled && list.current !== null,
    (target) => {
      const top =
        (target.anchor &&
          anchoredScrollTop(
            target.anchor,
            virtualizer.measurementsCache,
            anchors,
          )) ??
        target.top;
      virtualizer.scrollToOffset(top);
      reveal(scrollsSides ? target.sideways : target.left);
    },
    { key: list, on: list, within: placeWithin, beforePaint: true },
  );
  const keepScroll = useEffectEvent(() => {
    const element = list.current;
    if (restoring.current !== undefined || !element) {
      return;
    }
    onPlace?.({
      top: element.scrollTop,
      left: element.scrollLeft,
      anchor: scrollAnchor(
        virtualizer.measurementsCache,
        anchors,
        element.scrollTop,
      ),
    });
  });
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const scrolled = () => keepScroll();
    element.addEventListener('scroll', scrolled, { passive: true });
    return () => element.removeEventListener('scroll', scrolled);
  }, [list]);
  const sidewaysKept = useRef(sideways);
  useEffect(() => {
    if (restoring.current === undefined && sidewaysKept.current !== sideways) {
      sidewaysKept.current = sideways;
      onPlace?.({ sideways });
    }
  }, [sideways, onPlace, restoring]);
  const toggledKept = useRef(toggled);
  useEffect(() => {
    if (toggledKept.current !== toggled) {
      toggledKept.current = toggled;
      onPlace?.({ toggled });
    }
  }, [toggled, onPlace]);
}
