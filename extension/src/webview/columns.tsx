import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

// Widths of the Commits and Files columns; Diff takes the rest
export const defaultColumnWidths: readonly number[] = [460, 300];
const minColumnWidth = 120;
const minLastColumnWidth = 240;

interface Resizing {
  start: (index: number, event: React.PointerEvent) => void;
  reset: (index: number) => void;
}

const ColumnResizing = createContext<Resizing | undefined>(undefined);
export const ColumnResizingProvider = ColumnResizing.Provider;

function templateOf(widths: readonly number[]): string {
  return `${widths.map((width) => `${width}px`).join(' ')} minmax(${minLastColumnWidth}px, 1fr)`;
}

// Column widths that the resizers change; save is called when a drag ends
export function useColumnWidths(save: (widths: readonly number[]) => void) {
  const [widths, setWidths] = useState<readonly number[]>(defaultColumnWidths);
  const current = useRef(widths);
  const container = useRef<HTMLDivElement>(null);

  const update = useCallback((next: readonly number[]) => {
    current.current = next;
    setWidths(next);
  }, []);

  const load = useCallback(
    (saved: readonly number[] | undefined) =>
      update(
        saved?.length === defaultColumnWidths.length
          ? saved
          : defaultColumnWidths,
      ),
    [update],
  );

  const resizing = useMemo<Resizing>(
    () => ({
      start: (index, event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidths = current.current;
        // The last column keeps at least its minimum width
        const others = startWidths.reduce(
          (sum, width, i) => (i === index ? sum : sum + width),
          0,
        );
        const max = Math.max(
          minColumnWidth,
          (container.current?.clientWidth ?? Infinity) -
            others -
            minLastColumnWidth,
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
    [save, update],
  );

  return { container, template: templateOf(widths), load, resizing };
}

// The handle on a column's right edge; double-click resets the width
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
