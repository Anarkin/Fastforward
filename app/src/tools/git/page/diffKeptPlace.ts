import type { Virtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { anchoredScrollTop, scrollAnchor } from './diffScrollAnchor';
import type { DiffPlace } from './diffPlace';

const ownMoves = ['wheel', 'keydown', 'pointerdown'] as const;

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
  const restoring = useRef(place);
  useLayoutEffect(() => {
    const target = restoring.current;
    const element = list.current;
    if (target === undefined || !element || !settled) {
      return;
    }
    restoring.current = undefined;
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
  });
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
    const moved = () => {
      restoring.current = undefined;
    };
    element.addEventListener('scroll', scrolled, { passive: true });
    for (const move of ownMoves) {
      element.addEventListener(move, moved, { passive: true });
    }
    return () => {
      element.removeEventListener('scroll', scrolled);
      for (const move of ownMoves) {
        element.removeEventListener(move, moved);
      }
    };
  }, [list]);
  const sidewaysKept = useRef(sideways);
  useEffect(() => {
    if (restoring.current === undefined && sidewaysKept.current !== sideways) {
      sidewaysKept.current = sideways;
      onPlace?.({ sideways });
    }
  }, [sideways, onPlace]);
  const toggledKept = useRef(toggled);
  useEffect(() => {
    if (toggledKept.current !== toggled) {
      toggledKept.current = toggled;
      onPlace?.({ toggled });
    }
  }, [toggled, onPlace]);
}
