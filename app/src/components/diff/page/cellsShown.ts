import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefCallback,
  type RefObject,
} from 'react';
import { DiffCells, type CellsShown, type PaneBox } from './cells';
import type { SidewaysShown } from './sidewaysShown';

function paneBoxes(list: Element): PaneBox[] {
  return Array.from(list.querySelectorAll('.diff-ruler .diff-line'), (line) => {
    const box = line.getBoundingClientRect();
    const code = line.querySelector('.split-code')?.getBoundingClientRect();
    return { left: box.left, right: box.right, code: code?.left ?? box.left };
  });
}

export function useDiffCells(
  on: boolean,
  list: RefObject<HTMLDivElement | null>,
  sideways: SidewaysShown,
  shown: Omit<CellsShown, 'boxes'>,
): {
  readonly spacer: RefObject<HTMLDivElement | null>;
  readonly host: (pane: number) => RefCallback<HTMLDivElement>;
} {
  const spacer = useRef<HTMLDivElement>(null);
  const hosts = useRef<HTMLDivElement[]>([]);
  const cells = useRef<DiffCells>(undefined);
  const first = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      hosts.current[0] = element;
    } else {
      hosts.current.length = 0;
    }
  }, []);
  const second = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      hosts.current[1] = element;
    } else {
      hosts.current.length = Math.min(hosts.current.length, 1);
    }
  }, []);
  const host = useCallback(
    (pane: number): RefCallback<HTMLDivElement> =>
      pane === 0 ? first : second,
    [first, second],
  );
  useLayoutEffect(() => {
    const element = list.current;
    const within = spacer.current;
    if (!on || !element || !within) {
      cells.current?.dispose();
      cells.current = undefined;
      return;
    }
    cells.current ??= new DiffCells(element, within, hosts.current);
    cells.current.show({ ...shown, boxes: () => paneBoxes(element) });
  });
  useEffect(() => sideways.subscribe(() => cells.current?.moved()), [sideways]);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(() => cells.current?.moved());
    observer.observe(element);
    return () => observer.disconnect();
  }, [list]);
  useEffect(
    () => () => {
      cells.current?.dispose();
      cells.current = undefined;
    },
    [],
  );
  return { spacer, host };
}
