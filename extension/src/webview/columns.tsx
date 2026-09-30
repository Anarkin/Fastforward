import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export const defaultColumnWidths: readonly number[] = [460, 300];
const minColumnWidth = 120;
const minLastColumnWidth = 240;

interface Resizing {
  start: (index: number, event: React.PointerEvent) => void;
  reset: (index: number) => void;
}

const ColumnResizing = createContext<Resizing | undefined>(undefined);
export const ColumnResizingProvider = ColumnResizing.Provider;

export function columnsClass(
  commitsShown: boolean,
  selected: string | undefined,
): string {
  return [
    'columns',
    ...(commitsShown ? [] : ['commits-hidden']),
    ...(selected === undefined ? ['nothing-selected'] : []),
  ].join(' ');
}

export function templateOf(
  widths: readonly number[],
  hidden: readonly boolean[],
): string {
  return `${widths.map((width, i) => `${hidden[i] ? 0 : width}px`).join(' ')} minmax(${minLastColumnWidth}px, 1fr)`;
}

export function widthsToLoad(
  saved: readonly number[] | undefined,
): readonly number[] {
  return saved?.length === defaultColumnWidths.length
    ? saved
    : defaultColumnWidths;
}

export function maxWidth(
  widths: readonly number[],
  hidden: readonly boolean[],
  index: number,
  viewWidth: number,
): number {
  const others = widths.reduce(
    (sum, width, i) => (i === index || hidden[i] ? sum : sum + width),
    0,
  );
  return Math.max(minColumnWidth, viewWidth - others - minLastColumnWidth);
}

export function draggedWidths(
  start: readonly number[],
  index: number,
  delta: number,
  max: number,
): number[] {
  const width = Math.round(
    Math.min(max, Math.max(minColumnWidth, start[index] + delta)),
  );
  return start.map((w, i) => (i === index ? width : w));
}

export function resetWidth(widths: readonly number[], index: number): number[] {
  return widths.map((width, i) =>
    i === index ? defaultColumnWidths[i] : width,
  );
}

interface DragTarget<E> {
  addEventListener(type: string, listener: (event: E) => void): void;
  removeEventListener(type: string, listener: (event: E) => void): void;
}

export function followDrag<E extends { readonly buttons: number }>(
  target: DragTarget<E>,
  onMove: (event: E) => void,
  onEnd: () => void,
): void {
  const move = (event: E) => {
    if (event.buttons === 0) {
      end();
    } else {
      onMove(event);
    }
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    onEnd();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

export function useColumnWidths(
  save: (widths: readonly number[]) => void,
  hidden: readonly boolean[],
) {
  const [widths, setWidths] = useState<readonly number[]>(defaultColumnWidths);
  const current = useRef(widths);
  const container = useRef<HTMLDivElement>(null);

  const update = useCallback((next: readonly number[]) => {
    current.current = next;
    setWidths(next);
  }, []);

  const load = useCallback(
    (saved: readonly number[] | undefined) => update(widthsToLoad(saved)),
    [update],
  );

  const resizing = useMemo<Resizing>(
    () => ({
      start: (index, event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startWidths = current.current;
        const max = maxWidth(
          startWidths,
          hidden,
          index,
          container.current?.clientWidth ?? Infinity,
        );
        const onMove = (move: PointerEvent) => {
          // Straight on the grid while dragging, so the columns' contents
          // don't re-render on every move, only once it ends
          current.current = draggedWidths(
            startWidths,
            index,
            move.clientX - startX,
            max,
          );
          if (container.current) {
            container.current.style.gridTemplateColumns = templateOf(
              current.current,
              hidden,
            );
          }
        };
        followDrag(window, onMove, () => {
          document.body.classList.remove('resizing');
          update(current.current);
          save(current.current);
        });
        document.body.classList.add('resizing');
      },
      reset: (index) => {
        const next = resetWidth(current.current, index);
        update(next);
        save(next);
      },
    }),
    [save, update, hidden],
  );

  return { container, template: templateOf(widths, hidden), load, resizing };
}

export function Resizer({ index }: { index: number }) {
  const resizing = useContext(ColumnResizing);
  if (!resizing) {
    return null;
  }
  return (
    <div
      className="resizer"
      onPointerDown={(event) => resizing.start(index, event)}
      onDoubleClick={() => resizing.reset(index)}
    />
  );
}
