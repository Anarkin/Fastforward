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
        const startX = event.clientX;
        const startWidths = current.current;
        const max = maxWidth(
          startWidths,
          hidden,
          index,
          container.current?.clientWidth ?? Infinity,
        );
        const onMove = (move: PointerEvent) => {
          const width = Math.round(
            Math.min(
              max,
              Math.max(
                minColumnWidth,
                startWidths[index] + move.clientX - startX,
              ),
            ),
          );
          // Straight on the grid while dragging, so the columns' contents
          // don't re-render on every move, only once it ends
          current.current = startWidths.map((w, i) =>
            i === index ? width : w,
          );
          if (container.current) {
            container.current.style.gridTemplateColumns = templateOf(
              current.current,
              hidden,
            );
          }
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          document.body.classList.remove('resizing');
          update(current.current);
          save(current.current);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        document.body.classList.add('resizing');
      },
      reset: (index) => {
        const next = current.current.map((width, i) =>
          i === index ? defaultColumnWidths[i] : width,
        );
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
