import {
  observeElementOffset,
  type Virtualizer,
} from '@tanstack/react-virtual';
import { useCallback, useRef, type RefObject } from 'react';

type Rows<T extends Element> = Virtualizer<T, Element>;

export function useSeenOffsets<T extends Element>(): {
  readonly observeOffset: (
    instance: Rows<T>,
    seen: (offset: number, isScrolling: boolean) => void,
  ) => (() => void) | undefined;
  readonly offsetSeen: RefObject<((offset: number) => void) | undefined>;
  readonly laidOut: RefObject<Rows<T> | undefined>;
} {
  const offsetSeen = useRef<(offset: number) => void>(undefined);
  const laidOut = useRef<Rows<T>>(undefined);
  const observeOffset = useCallback(
    (
      instance: Rows<T>,
      seen: (offset: number, isScrolling: boolean) => void,
    ) => {
      laidOut.current = instance;
      offsetSeen.current = (offset) => seen(offset, true);
      return observeElementOffset(instance, seen);
    },
    [],
  );
  return { observeOffset, offsetSeen, laidOut };
}
