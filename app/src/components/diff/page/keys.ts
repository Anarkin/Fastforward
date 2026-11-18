import type { Virtualizer } from '@tanstack/react-virtual';
import type { KeyboardEvent, RefObject } from 'react';
import { keyPressed } from '../../../lib/page/shortcuts';
import { listMoveOf } from '../../../lib/page/listMoves';
import type { RowFollower } from '../../../lib/page/rowScroll';
import type { TextWidths } from '../../../lib/page/textWidths';
import { diffKeymap } from './keymap';
import type { DiffRow } from './rows';
import { changeStarts, keyedScrollTop } from './scrolling';
import { diffScrollLeft } from './sidewaysScroll';

export function diffKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  {
    sideways,
    room,
    setSideways,
    widths,
    follower,
    virtualizer,
    rows,
    lineHeight,
  }: {
    readonly sideways: number;
    readonly room: number | undefined;
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
    side === undefined || room === undefined
      ? undefined
      : diffScrollLeft(side, sideways, room, widths.char);
  if (left !== undefined) {
    event.preventDefault();
    setSideways(left);
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
