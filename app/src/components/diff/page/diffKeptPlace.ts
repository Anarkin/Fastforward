import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, type RefObject } from 'react';
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
  reveal,
}: {
  readonly list: RefObject<HTMLDivElement | null>;
  readonly place: DiffPlace | undefined;
  readonly onPlace: (change: Partial<DiffPlace>) => void;
  readonly settled: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly anchors: readonly (readonly string[])[];
  readonly scrollsSides: boolean;
  readonly reveal: (scrolled: number) => void;
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
    onPlace({
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
}
