import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { columnFocusAttribute } from './activeColumn';
import { fullyVisible, type VisibleRows } from './listMoves';

const estimatedRowHeight = 24;
const estimateSize = () => estimatedRowHeight;

export function scrollTarget(
  selectedKey: string | undefined,
  keys: readonly (string | number | null)[],
): string | undefined {
  return keys.includes(selectedKey ?? null) ? selectedKey : undefined;
}

export interface RowPlacement {
  readonly start: number;
  readonly end: number;
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
    const top = placements.findIndex((row) => row.end > covered);
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

export function VirtualRows({
  rows,
  selectedKey,
  ancestorsOf = noAncestors,
  onKeyDown,
}: {
  rows: readonly React.ReactElement[];
  selectedKey: string | undefined;
  ancestorsOf?: (index: number) => readonly number[];
  onKeyDown?: (event: React.KeyboardEvent, visible: VisibleRows) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const itemKey = useCallback(
    (index: number) => rows[index].key ?? index,
    [rows],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    estimateSize,
    getItemKey: itemKey,
    overscan: 20,
  });

  const heightOf = (index: number) => {
    const row = virtualizer.measurementsCache[index];
    return row ? row.end - row.start : 0;
  };
  const scrollToSelected = useEffectEvent(() => {
    const index = rows.findIndex((row) => row.key === selectedKey);
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
  const target = scrollTarget(
    selectedKey,
    rows.map((row) => row.key),
  );
  useEffect(() => {
    if (target !== undefined) {
      scrollToSelected();
    }
  }, [target]);

  const pinned = pinnedRows(
    virtualizer.measurementsCache,
    virtualizer.scrollOffset ?? 0,
    ancestorsOf,
  );

  return (
    <div className="virtual-rows-frame">
      {pinned.length > 0 && (
        <div className="pinned-rows">
          {pinned.map((index) => (
            <div key={rows[index].key ?? index}>{rows[index]}</div>
          ))}
        </div>
      )}
      <div
        className="virtual-rows"
        ref={list}
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
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              className="virtual-row"
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {rows[item.index]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
