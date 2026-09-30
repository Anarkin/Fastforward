import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

const estimatedRowHeight = 24;
const estimateSize = () => estimatedRowHeight;

export function scrollTarget(
  selectedKey: string | undefined,
  rowCount: number,
): string | undefined {
  return rowCount > 0 ? selectedKey : undefined;
}

export function VirtualRows({
  rows,
  selectedKey,
}: {
  rows: readonly React.ReactElement[];
  selectedKey: string | undefined;
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

  const scrollToSelected = useEffectEvent(() => {
    const index = rows.findIndex((row) => row.key === selectedKey);
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    }
  });
  const target = scrollTarget(selectedKey, rows.length);
  useEffect(() => {
    if (target !== undefined) {
      scrollToSelected();
    }
  }, [target]);

  return (
    <div className="virtual-rows" ref={list}>
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
  );
}
