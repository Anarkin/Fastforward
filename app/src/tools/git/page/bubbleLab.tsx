import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { BubbleReplica } from './bubbles';
import { shapeKey, type BubbleLook } from './bubbleLooks';
import { sameRows } from './bubbleLines';
import { advancesOf, sameAdvances, widthOf } from './bubbleRoom';

const noAdvances: ReadonlyMap<string, number> = new Map();

export const BubbleLab = memo(function BubbleLab({
  looks,
  rowsAt,
  onAdvances,
  onWidth,
}: {
  looks: readonly BubbleLook[];
  rowsAt: (width: number) => ReadonlyMap<number, readonly number[]>;
  onAdvances: (advances: ReadonlyMap<string, number>) => void;
  onWidth: (width: number) => void;
}) {
  const shapes = useMemo(() => {
    const distinct = new Map<string, BubbleLook>();
    for (const look of looks) {
      distinct.set(shapeKey(look), { ...look, text: '' });
    }
    return [...distinct.values()];
  }, [looks]);
  const lineRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const toldAdvances = useRef(noAdvances);
  const toldWidth = useRef(0);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const probe = probeRef.current;
    if (!row || !probe) {
      return undefined;
    }
    const measure = () => {
      const measured = advancesOf(row, probe, shapes, looks);
      if (!sameAdvances(measured, toldAdvances.current)) {
        toldAdvances.current = measured;
        onAdvances(measured);
      }
    };
    let rowWidth = row.getBoundingClientRect().width;
    measure();
    const observer = new ResizeObserver(() => {
      const width = row.getBoundingClientRect().width;
      if (width !== rowWidth) {
        rowWidth = width;
        measure();
      }
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [looks, shapes, onAdvances]);
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) {
      return undefined;
    }
    let shownRows = rowsAt(toldWidth.current);
    let lastWidth = Number.NaN;
    const measure = () => {
      const width = widthOf(line);
      if (width === lastWidth) {
        return;
      }
      lastWidth = width;
      const rows = rowsAt(width);
      if (!sameRows(rows, shownRows)) {
        shownRows = rows;
        toldWidth.current = width;
        onWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(line);
    return () => observer.disconnect();
  }, [rowsAt, onWidth]);
  return (
    <div className="bubble-lab" aria-hidden="true" style={{ paddingLeft: 0 }}>
      <div className="bubble-lab-line" ref={lineRef}>
        <span className="bubble-lab-row" ref={rowRef}>
          {shapes.map((shape) => (
            <BubbleReplica key={shapeKey(shape)} look={shape} />
          ))}
          <span className="bubble-lab-end" />
          <span className="bubble-lab-text" ref={probeRef}>
            {looks[0]?.text}
          </span>
        </span>
      </div>
    </div>
  );
});
