import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

// Widths of the Locations, Commits and Files columns; Diff takes the rest
export const defaultColumnWidths: readonly number[] = [240, 420, 300];
const minColumnWidth = 120;
const minLastColumnWidth = 240;

interface Resizing {
  start: (index: number, event: React.PointerEvent) => void;
  reset: (index: number) => void;
}

const ColumnResizing = createContext<Resizing | undefined>(undefined);
export const ColumnResizingProvider = ColumnResizing.Provider;

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
          update(startWidths.map((w, i) => (i === index ? width : w)));
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          document.body.classList.remove('resizing');
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

  const template = `${widths.map((width) => `${width}px`).join(' ')} minmax(${minLastColumnWidth}px, 1fr)`;

  return { container, template, load, resizing };
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
