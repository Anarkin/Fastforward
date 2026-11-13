import { useVirtualizer, type Rect } from '@tanstack/react-virtual';
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
  type ScrollSettings,
} from './rowScroll';

export const estimatedRowHeight = 22;

const exactHeight = (element: Element) =>
  element.getBoundingClientRect().height;

const loneSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodedKey(key: string): string {
  if (key.isWellFormed()) {
    return encodeURIComponent(key);
  }
  let encoded = '';
  let from = 0;
  for (const lone of key.matchAll(loneSurrogate)) {
    encoded += `${encodeURIComponent(key.slice(from, lone.index))}%u${lone[0].charCodeAt(0).toString(16)}`;
    from = lone.index + 1;
  }
  return `${encoded}${encodeURIComponent(key.slice(from))}`;
}

export const rowId = (list: string, key: React.Key) =>
  `${list}${encodedKey(String(key))}`;

export function activeDescendant(
  list: string,
  key: React.Key | undefined,
  drawn: readonly { readonly key: React.Key }[],
): string | undefined {
  return key !== undefined && drawn.some((row) => row.key === key)
    ? rowId(list, key)
    : undefined;
}

export interface TreeItem {
  readonly level: number;
  readonly expanded?: boolean;
}

export interface ListedRows {
  readonly count: number;
  readonly keyOf: (index: number) => string;
  readonly indexOf: (key: string) => number;
}

export function scrollTarget(
  selectedKey: string | undefined,
  keys: { indexOf(key: string): number },
): string | undefined {
  return selectedKey !== undefined && keys.indexOf(selectedKey) !== -1
    ? selectedKey
    : undefined;
}

interface Reveal {
  readonly key: string | undefined;
  readonly rows: readonly unknown[];
}

export function revealAgain(before: Reveal | undefined, now: Reveal): boolean {
  return (
    now.key !== undefined &&
    (before?.key !== now.key ||
      before.rows.length !== now.rows.length ||
      now.rows.some((value, index) => value !== before.rows[index]))
  );
}

export interface RowPlacement {
  readonly start: number;
  readonly end: number;
}

function firstEndingAfter(
  placements: readonly RowPlacement[],
  offset: number,
): number {
  let low = 0;
  let high = placements.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (placements[middle].end > offset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low === placements.length ? -1 : low;
}

export function pinnedRows(
  placements: readonly RowPlacement[],
  scrollTop: number,
  ancestorsOf: (index: number) => readonly number[],
): readonly number[] {
  let pinned: readonly number[] = [];
  for (;;) {
    const covered =
      scrollTop +
      pinned.reduce(
        (sum, index) => sum + placements[index].end - placements[index].start,
        0,
      );
    const top = firstEndingAfter(placements, covered);
    if (top === -1) {
      return pinned;
    }
    const ancestors = ancestorsOf(top);
    const outside = pinned.findIndex((row, depth) => ancestors[depth] !== row);
    if (outside !== -1) {
      return pinned.slice(0, outside);
    }
    const next = ancestors.at(pinned.length);
    if (next === undefined || placements[next].start >= covered) {
      return pinned;
    }
    pinned = [...pinned, next];
  }
}

export function revealOffset(
  row: RowPlacement,
  scrollTop: number,
  height: number,
  covered: number,
): number | undefined {
  if (row.start < scrollTop + covered) {
    return Math.max(0, row.start - covered);
  }
  if (row.end > scrollTop + height) {
    return row.end - height;
  }
  return undefined;
}

export function endCovered(element: Element | null): number {
  const style =
    element === null
      ? undefined
      : element.ownerDocument.defaultView?.getComputedStyle(element);
  return parseFloat(style?.paddingBottom ?? '') || 0;
}

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
  onScrolled,
  wheelStep,
  notchRows,
  overscan = 20,
  scrolling,
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
  onScrolled?: (offset: number) => void;
  wheelStep?: () => number;
  notchRows?: number;
  overscan?: number;
  scrolling: ScrollSettings;
}) {
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [fixedHeight, setFixedHeight] = useState<number>();
  const virtualizer = useVirtualizer({
    count: rows.count,
    getScrollElement: () => list.current,
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
  const follower = useRef<RowFollower>(undefined);
  const [roomHeight, setRoomHeight] = useState(0);
  const padding = wholeRows
    ? rowPadding(roomHeight, fixedHeight ?? estimatedRowHeight)
    : 0;
  useEffect(() => {
    const element = list.current;
    if (!wholeRows || !element) {
      return undefined;
    }
    const room = () => exactHeight(element) - endCovered(element);
    const following = followRows(element, rowHeight, {
      limit: () => totalSize() + rowPadding(room(), rowHeight()) - room(),
      step: stepOf,
      perNotch,
      smooth,
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
  }, [wholeRows]);

  const restored = useRef(initialOffset === 0);
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
  });

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
        revealGlides(scrolled, offset, rowHeight(), element.clientHeight),
      );
    } else {
      virtualizer.scrollToOffset(offset);
    }
  });
  const reveal = { key: scrollTarget(selectedKey, rows), rows: revealWith };
  const revealed = useRef<Reveal>(undefined);
  useEffect(() => {
    if (revealAgain(revealed.current, reveal)) {
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
      ref={list}
      role={treeItemOf ? 'tree' : 'listbox'}
      aria-label={label}
      aria-activedescendant={activeDescendant(listId, selectedKey, drawn)}
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
        {pinned.length > 0 && (
          <div className="pinned-rows">
            {pinned.map((index) => (
              <div key={rows.keyOf(index)}>{renderRow(index)}</div>
            ))}
          </div>
        )}
        {drawn.map((item) => (
          <div
            key={item.key}
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
