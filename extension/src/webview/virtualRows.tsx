import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useEffectEvent, useRef } from 'react';

// Rows are about this tall; each is measured once drawn
const estimatedRowHeight = 24;

// A scrolling list that mounts only the rows on screen, so a commit with
// thousands of files, or a big repository's tree, stays fast; it scrolls to
// the selected row when the selection changes, not when rows open or close
export function VirtualRows({
  rows,
  selectedKey,
}: {
  // Keyed, so each row keeps its identity while the list changes
  rows: readonly React.ReactElement[];
  selectedKey: string | undefined;
}) {
  const list = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    estimateSize: () => estimatedRowHeight,
    getItemKey: (index) => rows[index].key ?? index,
    overscan: 20,
  });

  const scrollToSelected = useEffectEvent(() => {
    const index = rows.findIndex((row) => row.key === selectedKey);
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    }
  });
  // Also once the rows arrive, as a tree loads after its file was selected
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (selectedKey !== undefined && hasRows) {
      scrollToSelected();
    }
  }, [selectedKey, hasRows]);

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
