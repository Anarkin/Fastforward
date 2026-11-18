import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, type RefObject } from 'react';
import { useRestore } from '../../../lib/page/restore';
import { anchoredScrollTop, scrollAnchor } from './scrollAnchor';
import type { DiffPlace } from './place';

const placeWithin = 10_000;

export function useKeptPlace({
  list,
  place,
  onPlace,
  settled,
  virtualizer,
  anchors,
  reveal,
  line,
}: {
  readonly list: RefObject<HTMLDivElement | null>;
  readonly place: DiffPlace | undefined;
  readonly onPlace: (change: Partial<DiffPlace>) => void;
  readonly settled: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly anchors: readonly (readonly string[])[];
  readonly reveal: (scrolled: number) => void;
  readonly line: number;
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
            line,
          )) ??
        target.top;
      virtualizer.scrollToOffset(top);
      reveal(target.sideways);
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
