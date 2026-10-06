import { memo, useEffect, useRef, useState } from 'react';
import { clicked, keymap, type Modifiers } from '../shared/keymap';
import { hideAfter } from './overlayScrollbars';

export interface MinimapMark {
  readonly kind: 'added' | 'removed' | 'match';
  readonly top: number;
  readonly height: number;
}

export interface MinimapRow {
  readonly height: number;
  readonly change: 'added' | 'removed' | undefined;
}

function runMarks(
  rows: readonly MinimapRow[],
  kindOf: (row: MinimapRow, index: number) => MinimapMark['kind'] | undefined,
): MinimapMark[] {
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
  rows.forEach((row, index) => {
    const kind = kindOf(row, index);
    if (kind === undefined || kind !== run?.kind) {
      close();
    }
    if (kind !== undefined) {
      run ??= { kind, start: offset, end: offset };
      run.end = offset + row.height;
    }
    offset += row.height;
  });
  close();
  return marks;
}

export function minimapMarks(rows: readonly MinimapRow[]): MinimapMark[] {
  return runMarks(rows, (row) => row.change);
}

export function matchMarks(
  rows: readonly MinimapRow[],
  found: ReadonlySet<number>,
): MinimapMark[] {
  return runMarks(rows, (_, index) => (found.has(index) ? 'match' : undefined));
}

export function pointerFraction(
  clientY: number,
  box: { readonly top: number; readonly height: number },
): number {
  return box.height > 0 ? (clientY - box.top) / box.height : 0;
}

export function minimapScrollTop(
  fraction: number,
  total: number,
  viewport: number,
): number {
  const top = fraction * total - viewport / 2;
  return Math.max(0, Math.min(top, total - viewport));
}

export function grabPointer(
  event: Modifiers & {
    readonly button: number;
    readonly pointerId: number;
    readonly preventDefault: () => void;
    readonly currentTarget: { setPointerCapture: (id: number) => void };
  },
): boolean {
  if (!clicked(keymap.drag, event)) {
    return false;
  }
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}

function percent(value: number): string {
  return `${value * 100}%`;
}

const Marks = memo(function Marks({
  marks,
}: {
  marks: readonly MinimapMark[];
}) {
  return marks.map((mark) => (
    <div
      key={`${mark.kind}:${mark.top}`}
      className={`minimap-mark ${mark.kind}`}
      style={{ top: percent(mark.top), height: percent(mark.height) }}
    />
  ));
});

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
    const fraction = pointerFraction(
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    onScroll(minimapScrollTop(fraction, total, viewport));
  };
  return (
    <div
      ref={element}
      className={`diff-minimap ${shown || dragging ? 'shown' : ''} ${dragging ? 'dragging' : ''}`}
      onPointerDown={(event) => {
        if (grabPointer(event)) {
          setDragging(true);
          scrollTo(event);
        }
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          scrollTo(event);
        }
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <Marks marks={marks} />
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
