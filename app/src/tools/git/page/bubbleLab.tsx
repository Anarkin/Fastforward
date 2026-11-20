import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { BubbleReplica } from './bubbles';
import type { BubbleLook } from './bubbleLooks';
import { advancesOf, sameAdvances, shapedLooks, widthOf } from './bubbleRoom';

const noAdvances: ReadonlyMap<string, number> = new Map();

export const BubbleLab = memo(function BubbleLab({
  looks,
  onAdvances,
  onWidth,
}: {
  looks: ReadonlyMap<string, BubbleLook>;
  onAdvances: (advances: ReadonlyMap<string, number>) => void;
  onWidth: (width: number) => void;
}) {
  const { shapes, texts } = useMemo(() => shapedLooks(looks), [looks]);
  const lineRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const toldAdvances = useRef(noAdvances);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const probe = probeRef.current;
    if (!row || !probe) {
      return undefined;
    }
    const measure = () => {
      const measured = advancesOf(row, probe, texts);
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
  }, [texts, onAdvances]);
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) {
      return undefined;
    }
    let told = Number.NaN;
    const measure = () => {
      const width = widthOf(line);
      if (width !== told) {
        told = width;
        onWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(line);
    return () => observer.disconnect();
  }, [onWidth]);
  return (
    <div className="bubble-lab" aria-hidden="true" style={{ paddingLeft: 0 }}>
      <div className="bubble-lab-line" ref={lineRef}>
        <span className="bubble-lab-row" ref={rowRef}>
          {[...shapes].map(([key, shape]) => (
            <BubbleReplica key={key} look={shape} />
          ))}
          <span className="bubble-lab-end" />
          <span className="bubble-lab-text" ref={probeRef}>
            {texts[0]?.text}
          </span>
        </span>
      </div>
    </div>
  );
});
