import {
  defaultRangeExtractor,
  useVirtualizer,
  type Rect,
} from '@tanstack/react-virtual';
import { aimedRange, useLaterRows } from './laterRows';
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { columnFocusAttribute } from './columnFocus';
import { fullyVisible, type VisibleRows } from './listMoves';
import { rowPlace } from './rowPlace';
import {
  followRows,
  revealGlides,
  rowPadding,
  type RowFollower,
} from './rowScroll';
import type { ScrollSettings } from './scrollSettings';
import { useSeenOffsets } from './seenOffsets';

import {
  endCovered,
  estimatedRowHeight,
  revealAgain,
  revealOffset,
  rowRoom,
  scrollTarget,
  type ListedRows,
  type Reveal,
  type TreeItem,
} from './listRows';
import { activeDescendant, rowId } from './rowIds';
import { pinnedRows } from './pinnedRows';
import { useRowSlots } from './rowSlots';
import { restoreWhen, type Restoring } from './restore';

const exactHeight = (element: Element) =>
  element.getBoundingClientRect().height;

const RowContent = memo(function RowContent({
  index,
  renderRow,
}: {
  index: number;
  renderRow: (index: number) => React.ReactNode;
}) {
  return renderRow(index);
});

const noAncestors = () => [];

const noValues: readonly unknown[] = [];

const keyReveals = 100;

export interface RowsDrawn {
  readonly count: number;
  readonly placeOf: (
    index: number,
  ) => { readonly top: number; readonly height: number } | undefined;
  readonly pinnedAt: (offset: number) => readonly number[];
}

export function VirtualRows({
  rows,
  renderRow,
  selectedKey,
  revealWith = noValues,
  ancestorsOf = noAncestors,
  onKeyDown,
  initialRect,
  label,
  treeItemOf,
  wholeRows = false,
  initialOffset = 0,
  revealAtStart = true,
  placeKey,
  onScrolled,
  wheelStep,
  notchRows,
  overscan = 20,
  recycled = false,
  scrolling,
  fixedRowHeight,
  renderCanvas,
  listRef,
}: {
  rows: ListedRows;
  renderRow: (index: number) => React.ReactNode;
  selectedKey: string | undefined;
  revealWith?: readonly unknown[];
  ancestorsOf?: (index: number) => readonly number[];
  onKeyDown?: (event: React.KeyboardEvent, visible: VisibleRows) => void;
  initialRect?: Rect;
  label?: string;
  treeItemOf?: (index: number) => TreeItem;
  wholeRows?: boolean;
  initialOffset?: number;
  revealAtStart?: boolean;
  placeKey?: string;
  onScrolled?: (offset: number) => void;
  wheelStep?: () => number;
  notchRows?: number;
  overscan?: number;
  recycled?: boolean;
  scrolling: ScrollSettings;
  fixedRowHeight?: number | undefined;
  renderCanvas?: (drawn: RowsDrawn) => React.ReactNode;
  listRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const setList = useCallback(
    (element: HTMLDivElement | null) => {
      list.current = element;
      if (listRef) {
        listRef.current = element;
      }
    },
    [listRef],
  );
  const listId = useId();
  const [measuredHeight, setFixedHeight] = useState<number>();
  const fixedHeight = fixedRowHeight ?? measuredHeight;
  const { observeOffset, offsetSeen } = useSeenOffsets<HTMLDivElement>();
  const follower = useRef<RowFollower>(undefined);
  const slotsOf = useRowSlots();
  const rowsNow = useLaterRows(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const to = follower.current?.glidingTo();
      return defaultRangeExtractor(
        aimedRange(
          range,
          to === undefined
            ? undefined
            : Math.floor(to / (fixedHeight ?? estimatedRowHeight)),
        ),
      );
    },
    wholeRows && fixedHeight !== undefined,
  );
  const virtualizer = useVirtualizer({
    count: rows.count,
    getScrollElement: () => list.current,
    rangeExtractor: rowsNow,
    estimateSize: useCallback(
      () => fixedHeight ?? estimatedRowHeight,
      [fixedHeight],
    ),
    measureElement: useCallback(
      (element: Element) => {
        const height = exactHeight(element);
        if (wholeRows && height > 0) {
          setFixedHeight(height);
        }
        return height;
      },
      [wholeRows],
    ),
    getItemKey: rows.keyOf,
    overscan,
    initialRect,
    observeElementOffset: observeOffset,
  });

  useLayoutEffect(() => {
    if (fixedHeight !== undefined) {
      virtualizer.measure();
    }
  }, [fixedHeight, virtualizer]);
  const rowHeight = useEffectEvent(() => fixedHeight ?? estimatedRowHeight);
  const totalSize = useEffectEvent(() => virtualizer.getTotalSize());
  const stepOf = useEffectEvent(() => wheelStep?.() ?? rowHeight());
  const perNotch = useEffectEvent(() => notchRows ?? scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  const settles = useEffectEvent(() => scrolling.smoothSnap);
  const [roomHeight, setRoomHeight] = useState(0);
  const padding = wholeRows
    ? rowPadding(roomHeight, fixedHeight ?? estimatedRowHeight)
    : 0;
  useEffect(() => {
    const element = list.current;
    if (!wholeRows || !element) {
      return undefined;
    }
    const room = () => rowRoom(element);
    const following = followRows(element, rowHeight, {
      limit: () => totalSize() + rowPadding(room(), rowHeight()) - room(),
      step: stepOf,
      perNotch,
      smooth,
      settles,
      onPlace: (top) => offsetSeen.current?.(top),
    });
    follower.current = following;
    const measure = () => setRoomHeight(room());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      following.stop();
      follower.current = undefined;
      observer.disconnect();
    };
  }, [wholeRows, offsetSeen]);

  const restored = useRef(initialOffset === 0);
  const placed = useRef(placeKey);
  const reveal = { key: scrollTarget(selectedKey, rows), rows: revealWith };
  const revealed = useRef<Reveal>(revealAtStart ? undefined : reveal);
  const holding = useRef<Restoring>(undefined);
  useLayoutEffect(() => {
    if (placed.current !== placeKey) {
      placed.current = placeKey;
      restored.current = false;
      revealed.current = revealAtStart ? undefined : reveal;
    }
  });
  useLayoutEffect(() => {
    const element = list.current;
    if (
      restored.current ||
      !element ||
      (wholeRows && (fixedHeight === undefined || roomHeight === 0))
    ) {
      return;
    }
    restored.current = true;
    element.scrollTop = initialOffset;
    if (!revealAtStart) {
      holding.current?.stop();
      holding.current = restoreWhen(
        undefined,
        () => false,
        () => undefined,
      );
    }
  });
  useEffect(() => () => holding.current?.stop(), []);

  const heightOf = (index: number) => {
    const row = virtualizer.measurementsCache[index];
    return row ? row.end - row.start : 0;
  };
  const scrollToSelected = useEffectEvent(() => {
    const index = selectedKey === undefined ? -1 : rows.indexOf(selectedKey);
    const element = list.current;
    const row = virtualizer.measurementsCache[index];
    if (index === -1 || !element || !row) {
      return;
    }
    const scrolled = follower.current?.aim() ?? element.scrollTop;
    const offset = revealOffset(
      row,
      scrolled,
      element.clientHeight - endCovered(element),
      ancestorsOf(index).reduce((sum, ancestor) => sum + heightOf(ancestor), 0),
    );
    if (offset === undefined) {
      return;
    }
    if (follower.current) {
      follower.current.scrollTo(
        offset,
        performance.now() - keyed.current < keyReveals ||
          revealGlides(scrolled, offset, rowHeight(), element.clientHeight),
      );
    } else {
      virtualizer.scrollToOffset(offset);
    }
  });
  const keyed = useRef(-Infinity);
  useEffect(() => {
    if (
      revealAgain(revealed.current, reveal) &&
      holding.current?.pending() !== true
    ) {
      scrollToSelected();
    }
    revealed.current = reveal;
  });

  const pinned = pinnedRows(
    virtualizer.measurementsCache,
    virtualizer.scrollOffset ?? 0,
    ancestorsOf,
  );

  const drawn = virtualizer.getVirtualItems();
  const slots =
    recycled && wholeRows ? slotsOf(drawn.map((item) => item.key)) : undefined;
  const itemProps = (index: number, key: React.Key) => {
    const item = treeItemOf?.(index);
    return {
      id: rowId(listId, key),
      role: treeItemOf ? 'treeitem' : 'option',
      'aria-selected': key === selectedKey,
      'aria-level': item?.level,
      'aria-expanded': item?.expanded,
    };
  };

  return (
    <div
      className="virtual-rows"
      ref={setList}
      role={treeItemOf ? 'tree' : 'listbox'}
      aria-label={label}
      aria-activedescendant={
        renderCanvas ? undefined : activeDescendant(listId, selectedKey, drawn)
      }
      onScroll={
        onScrolled &&
        ((event: React.UIEvent<HTMLElement>) => {
          if (restored.current) {
            onScrolled(event.currentTarget.scrollTop);
          }
        })
      }
      {...(onKeyDown
        ? {
            tabIndex: 0,
            [columnFocusAttribute]: '',
            onKeyDown: (event: React.KeyboardEvent) => {
              keyed.current = performance.now();
              const covered = pinned.reduce(
                (sum, index) => sum + heightOf(index),
                0,
              );
              onKeyDown(
                event,
                fullyVisible(
                  virtualizer.getVirtualItems(),
                  (list.current?.scrollTop ?? 0) + covered,
                  (list.current?.clientHeight ?? 0) -
                    covered -
                    endCovered(list.current),
                  0,
                ),
              );
            },
          }
        : {})}
    >
      <div
        className="virtual-spacer"
        style={{ height: virtualizer.getTotalSize() + padding }}
      >
        {renderCanvas?.({
          count: rows.count,
          placeOf: (index) => {
            const row = virtualizer.measurementsCache[index];
            return row && { top: row.start, height: row.end - row.start };
          },
          pinnedAt: (offset) =>
            pinnedRows(virtualizer.measurementsCache, offset, ancestorsOf),
        })}
        {!renderCanvas && pinned.length > 0 && (
          <div className="pinned-rows">
            {pinned.map((index) => (
              <div key={rows.keyOf(index)}>{renderRow(index)}</div>
            ))}
          </div>
        )}
        {(renderCanvas ? [] : drawn).map((item) => (
          <div
            key={slots?.get(item.key) ?? item.key}
            {...itemProps(item.index, item.key)}
            className="virtual-row"
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={rowPlace(item.start, undefined)}
          >
            <RowContent index={item.index} renderRow={renderRow} />
          </div>
        ))}
      </div>
    </div>
  );
}
