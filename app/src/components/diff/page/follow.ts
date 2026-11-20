import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { rowRoom } from '../../../lib/page/listRows';
import {
  followRows,
  rowPadding,
  type RowFollower,
} from '../../../lib/page/rowScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';

export function useDiffFollow({
  list,
  followerRef,
  offsetSeen,
  virtualizer,
  lineHeight,
  scrolling,
}: {
  readonly list: RefObject<HTMLDivElement | null>;
  readonly followerRef: RefObject<RowFollower | undefined>;
  readonly offsetSeen: RefObject<((offset: number) => void) | undefined>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly lineHeight: number;
  readonly scrolling: ScrollSettings;
}): number {
  const [roomHeight, setRoomHeight] = useState(0);
  const endPadding = rowPadding(roomHeight, lineHeight);
  const lineOf = useEffectEvent(() => lineHeight);
  const totalOf = useEffectEvent(() => virtualizer.getTotalSize());
  const perNotch = useEffectEvent(() => scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  const settles = useEffectEvent(() => scrolling.smoothSnap);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const room = () => rowRoom(element);
    const following = followRows(element, lineOf, {
      limit: () => totalOf() + rowPadding(room(), lineOf()) - room(),
      perNotch,
      smooth,
      settles,
      onPlace: (top) => offsetSeen.current?.(top),
    });
    followerRef.current = following;
    const measure = () => setRoomHeight(room());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      following.stop();
      followerRef.current = undefined;
      observer.disconnect();
    };
  }, [list, followerRef, offsetSeen]);
  return endPadding;
}
