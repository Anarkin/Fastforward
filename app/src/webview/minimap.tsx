import { useEffect, useRef, useState } from 'react';
import { hideAfter } from './overlayScrollbars';

export interface MinimapMark {
  readonly kind: 'added' | 'removed';
  readonly top: number;
  readonly height: number;
}

export interface MinimapRow {
  readonly height: number;
  readonly change: 'added' | 'removed' | undefined;
}

export function minimapMarks(rows: readonly MinimapRow[]): MinimapMark[] {
  const total = rows.reduce((sum, row) => sum + row.height, 0);
  if (total === 0) {
    return [];
  }
  const marks: MinimapMark[] = [];
  let offset = 0;
  let run:
    { kind: MinimapMark['kind']; start: number; end: number } | undefined;
  const close = () => {
    if (run) {
      marks.push({
        kind: run.kind,
        top: run.start / total,
        height: (run.end - run.start) / total,
      });
      run = undefined;
    }
  };
  for (const row of rows) {
    if (row.change === undefined || row.change !== run?.kind) {
      close();
    }
    if (row.change !== undefined) {
      run ??= { kind: row.change, start: offset, end: offset };
      run.end = offset + row.height;
    }
    offset += row.height;
  }
  close();
  return marks;
}

export function minimapScrollTop(
  fraction: number,
  total: number,
  viewport: number,
): number {
  const top = fraction * total - viewport / 2;
  return Math.max(0, Math.min(top, total - viewport));
}

function percent(value: number): string {
  return `${value * 100}%`;
}

export function Minimap({
  marks,
  scrollTop,
  viewport,
  total,
  onScroll,
}: {
  marks: readonly MinimapMark[];
  scrollTop: number;
  viewport: number;
  total: number;
  onScroll: (top: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<number>(undefined);
  const show = useRef(() => {
    setShown(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(false), hideAfter);
  });
  useEffect(() => {
    const area = element.current?.parentElement;
    const poke = show.current;
    area?.addEventListener('pointermove', poke);
    return () => {
      area?.removeEventListener('pointermove', poke);
      window.clearTimeout(timer.current);
    };
  }, []);
  const scrolled = useRef(scrollTop);
  useEffect(() => {
    if (scrolled.current !== scrollTop) {
      scrolled.current = scrollTop;
      show.current();
    }
  }, [scrollTop]);

  const scrollTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - box.top) / box.height;
    onScroll(minimapScrollTop(fraction, total, viewport));
  };
  return (
    <div
      ref={element}
      className={`diff-minimap ${shown || dragging ? 'shown' : ''} ${dragging ? 'dragging' : ''}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        scrollTo(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          scrollTo(event);
        }
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {marks.map((mark) => (
        <div
          key={`${mark.kind}:${mark.top}`}
          className={`minimap-mark ${mark.kind}`}
          style={{ top: percent(mark.top), height: percent(mark.height) }}
        />
      ))}
      {total > viewport && (
        <div
          className="minimap-viewport"
          style={{
            top: percent(scrollTop / total),
            height: percent(viewport / total),
          }}
        />
      )}
    </div>
  );
}
