import { followDrag } from '../../../ui/followDrag';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  diffShown = true,
): string {
  return [
    'columns',
    ...(commitsShown ? [] : ['commits-hidden']),
    ...(selected === undefined ? ['nothing-selected'] : []),
    ...(diffShown ? [] : ['no-changes']),
  ].join(' ');
}

export function showsDiff(
  error: string | undefined,
  listsNothing: boolean,
): boolean {
  return error !== undefined || !listsNothing;
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

export function drawnWidths(
  widths: readonly number[],
  hidden: readonly boolean[],
  tracks: string,
): number[] {
  const drawn = tracks.split(' ').map(parseFloat);
  return widths.map((width, i) =>
    hidden[i] || drawn[i] > width - 0.5
      ? width
      : Math.max(minColumnWidths[i], Math.floor(drawn[i])),
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
        const grid = container.current;
        const style = grid ? getComputedStyle(grid) : undefined;
        const startWidths = style
          ? drawnWidths(current.current, hidden, style.gridTemplateColumns)
          : current.current;
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
        const resizeGridWithoutRerendering = (move: PointerEvent) => {
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
        followDrag(window, resizeGridWithoutRerendering, () => {
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
