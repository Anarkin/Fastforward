import { useVirtualizer, type Rect } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { columnFocusAttribute } from './activeColumn';
import { uniformHeight } from './diffView';
import { fullyVisible, type VisibleRows } from './listMoves';
import { rowPlace } from './rowPlace';

const estimateSize = () => uniformHeight;

export const rowId = (list: string, key: React.Key) =>
  `${list}${encodeURIComponent(String(key))}`;

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
}) {
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const virtualizer = useVirtualizer({
    count: rows.count,
    getScrollElement: () => list.current,
    estimateSize,
    getItemKey: rows.keyOf,
    overscan: 20,
    initialRect,
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
    const offset = revealOffset(
      row,
      element.scrollTop,
      element.clientHeight,
      ancestorsOf(index).reduce((sum, ancestor) => sum + heightOf(ancestor), 0),
    );
    if (offset !== undefined) {
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
                  (list.current?.clientHeight ?? 0) - covered,
                  0,
                ),
              );
            },
          }
        : {})}
    >
      <div
        className="virtual-spacer"
        style={{ height: virtualizer.getTotalSize() }}
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
            {renderRow(item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
