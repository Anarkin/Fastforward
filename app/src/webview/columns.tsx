import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { released } from '../shared/keymap';
import { workingTreeHash } from '../shared/protocol';

export const minColumnWidths = [275, 150];
export const minLastColumnWidth = 240;

interface Resizing {
  start: (index: number, event: React.PointerEvent) => void;
  reset: (index: number) => void;
}

const ColumnResizing = createContext<Resizing | undefined>(undefined);
export const ColumnResizingProvider = ColumnResizing.Provider;

export function shownSelection(
  selected: string | undefined,
  workingTree: number | undefined,
): string | undefined {
  return selected === workingTreeHash && !workingTree ? undefined : selected;
}

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

export function listError(
  error: string | undefined,
  selected: string | undefined,
): string | undefined {
  return selected === undefined ? error : undefined;
}

export function templateOf(
  widths: readonly number[],
  hidden: readonly boolean[],
): string {
  return `${widths.map((width, i) => (hidden[i] ? '0px' : `minmax(${minColumnWidths[i]}px, ${width}px)`)).join(' ')} minmax(${minLastColumnWidth}px, 1fr)`;
}

export function widthsToLoad(
  saved: readonly number[],
  defaults: readonly number[],
): readonly number[] {
  return saved.length === defaults.length ? saved : defaults;
}

export function maxWidth(
  widths: readonly number[],
  hidden: readonly boolean[],
  index: number,
  viewWidth: number,
  spacing: number,
): number {
  const others = widths.reduce(
    (sum, width, i) => (i === index || hidden[i] ? sum : sum + width),
    0,
  );
  return Math.max(
    minColumnWidths[index],
    viewWidth - spacing - others - minLastColumnWidth,
  );
}

export function draggedWidths(
  start: readonly number[],
  index: number,
  delta: number,
  max: number,
): number[] {
  const width = Math.round(
    Math.min(max, Math.max(minColumnWidths[index], start[index] + delta)),
  );
  return start.map((w, i) => (i === index ? width : w));
}

export function resetWidth(
  widths: readonly number[],
  index: number,
  defaults: readonly number[],
): number[] {
  return widths.map((width, i) => (i === index ? defaults[i] : width));
}

interface DragTarget<E> {
  addEventListener(type: string, listener: (event: E) => void): void;
  removeEventListener(type: string, listener: (event: E) => void): void;
}

const endEvents = ['pointerup', 'pointercancel', 'lostpointercapture'];

export function followDrag<E extends { readonly buttons: number }>(
  target: DragTarget<E>,
  onMove: (event: E) => void,
  onEnd: () => void,
): void {
  const move = (event: E) => {
    if (released(event)) {
      end();
    } else {
      onMove(event);
    }
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    for (const type of endEvents) {
      target.removeEventListener(type, end);
    }
    onEnd();
  };
  target.addEventListener('pointermove', move);
  for (const type of endEvents) {
    target.addEventListener(type, end);
  }
}

export function useColumnWidths(
  save: (widths: readonly number[]) => void,
  hidden: readonly boolean[],
) {
  const [widths, setWidths] = useState<readonly number[]>([]);
  const current = useRef(widths);
  const defaults = useRef<readonly number[]>([]);
  const container = useRef<HTMLDivElement>(null);

  const update = useCallback((next: readonly number[]) => {
    current.current = next;
    setWidths(next);
  }, []);

  const load = useCallback(
    (saved: readonly number[], fallback: readonly number[]) => {
      defaults.current = fallback;
      update(widthsToLoad(saved, fallback));
    },
    [update],
  );

  const resizing = useMemo<Resizing>(
    () => ({
      start: (index, event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startWidths = current.current;
        const grid = container.current;
        const style = grid ? getComputedStyle(grid) : undefined;
        const max = maxWidth(
          startWidths,
          hidden,
          index,
          grid?.clientWidth ?? Infinity,
          style
            ? parseFloat(style.paddingLeft) +
                parseFloat(style.paddingRight) +
                parseFloat(style.columnGap) * startWidths.length
            : 0,
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
        const next = resetWidth(current.current, index, defaults.current);
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
