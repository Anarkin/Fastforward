import type { Virtualizer } from '@tanstack/react-virtual';
import type { KeyboardEvent, RefObject } from 'react';
import { keyPressed } from './shortcuts';
import { listMoveOf } from './listMoves';
import type { RowFollower } from './rowScroll';
import type { TextWidths } from './textWidths';
import { diffKeymap } from './diffKeymap';
import type { DiffRow } from './diffRows';
import { changeStarts, keyedScrollTop } from './diffScrolling';
import { diffScrollLeft, sideRoom } from './sidewaysScroll';

export function diffKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  {
    scrollsSides,
    sideways,
    setSideways,
    widths,
    follower,
    virtualizer,
    rows,
    lineHeight,
  }: {
    readonly scrollsSides: boolean;
    readonly sideways: number;
    readonly setSideways: (sideways: number) => void;
    readonly widths: TextWidths;
    readonly follower: RefObject<RowFollower | undefined>;
    readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
    readonly rows: readonly DiffRow[];
    readonly lineHeight: number;
  },
): void {
  const side = keyPressed(diffKeymap.sideways, event);
  const left =
    side === undefined
      ? undefined
      : scrollsSides
        ? diffScrollLeft(
            side,
            sideways,
            sideRoom(event.currentTarget).widest,
            widths.char,
          )
        : diffScrollLeft(
            side,
            event.currentTarget.scrollLeft,
            undefined,
            widths.char,
          );
  if (left !== undefined) {
    event.preventDefault();
    if (scrollsSides) {
      setSideways(left);
    } else {
      event.currentTarget.scrollLeft = left;
    }
    return;
  }
  const step = keyPressed(diffKeymap.change, event);
  const move = listMoveOf(event);
  const top = keyedScrollTop(
    step,
    move,
    follower.current?.aim() ?? event.currentTarget.scrollTop,
    event.currentTarget.clientHeight,
    virtualizer.getTotalSize(),
    lineHeight,
    () =>
      changeStarts(rows).map(
        (index) => virtualizer.measurementsCache[index]?.start ?? 0,
      ),
  );
  if (top === undefined) {
    return;
  }
  event.preventDefault();
  if (follower.current) {
    follower.current.scrollTo(
      top,
      step === undefined && (move === 'pageUp' || move === 'pageDown'),
    );
  } else {
    virtualizer.scrollToOffset(top);
  }
}
