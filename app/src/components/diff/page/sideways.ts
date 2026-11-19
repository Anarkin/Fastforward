import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  followColumns,
  type ColumnFollower,
} from '../../../lib/page/columnScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import type { HeldScroller } from '../../../lib/page/scrollbarLinks';
import { codeShift, sideWidth, wheelsSideways } from './sidewaysScroll';
import { dottedColumns, sidewaysRoom, type Sideways } from './overflow';
import { sidewaysShown, type SidewaysShown } from './sidewaysShown';

export interface SideBox {
  readonly width: number;
}

export function readSideBox(element: HTMLElement): SideBox {
  return { width: sideWidth(element) };
}

type DotColumns = readonly [number, number] | undefined;

const sameColumns = (one: DotColumns, other: DotColumns) =>
  one?.[0] === other?.[0] && one?.[1] === other?.[1];

const movedCode = '.diff-row .split-code > .code';

export function useSideways(
  listRef: RefObject<HTMLDivElement | null>,
  wordWrap: boolean,
  kept: number,
  keep: (sideways: number) => void,
  advance: number,
  scale: number,
  scrolling: ScrollSettings,
  widest: number,
): {
  readonly shown: SidewaysShown;
  readonly dotColumns: DotColumns;
  readonly room: number | undefined;
  readonly placeCode: (code: HTMLElement | null) => void;
  readonly scrolledNow: () => number;
  readonly scrollTo: (left: number) => void;
  readonly glideTo: (left: number) => void;
  readonly measureSideways: () => void;
  readonly held: HeldScroller;
} {
  const scrolled = useRef(kept);
  const across = useRef<ColumnFollower>(undefined);
  const [shown] = useState(() => sidewaysShown());
  const [box, setBox] = useState<SideBox>();
  const [dotColumns, setDotColumns] = useState<DotColumns>();
  const dotted = useRef<DotColumns>(undefined);
  const room =
    box && !wordWrap ? sidewaysRoom(widest, advance, box.width) : undefined;
  const now = useRef({ wordWrap, scale, advance, box, room });
  const viewNow = useCallback((): Sideways | undefined => {
    const { box: side, room: most } = now.current;
    return side && most !== undefined
      ? {
          scrolled: scrolled.current,
          width: side.width,
          room: most,
        }
      : undefined;
  }, []);
  const dotAround = useCallback(
    (atOnce: boolean) => {
      const next = dottedColumns(
        viewNow(),
        now.current.advance,
        dotted.current,
      );
      if (sameColumns(next, dotted.current)) {
        return;
      }
      dotted.current = next;
      if (atOnce) {
        setDotColumns(next);
      } else {
        startTransition(() => setDotColumns(next));
      }
    },
    [viewNow],
  );
  const scrollTo = useCallback(
    (left: number) => {
      if (left === scrolled.current) {
        return;
      }
      scrolled.current = left;
      const shift = now.current.wordWrap
        ? ''
        : codeShift(left, now.current.scale);
      for (const code of listRef.current?.querySelectorAll<HTMLElement>(
        movedCode,
      ) ?? []) {
        code.style.transform = shift;
      }
      shown.set(viewNow());
      dotAround(false);
      keep(left);
    },
    [listRef, shown, keep, viewNow, dotAround],
  );
  const placeCode = useCallback(
    (code: HTMLElement | null) => {
      if (code) {
        code.style.transform = wordWrap
          ? ''
          : codeShift(scrolled.current, scale);
      }
    },
    [wordWrap, scale],
  );
  useLayoutEffect(() => {
    now.current = { wordWrap, scale, advance, box, room };
    shown.set(viewNow());
    dotAround(true);
  }, [wordWrap, scale, advance, box, room, shown, viewNow, dotAround]);
  const perNotch = useEffectEvent(() => scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  const settles = useEffectEvent(() => scrolling.smoothSnap);
  useEffect(() => {
    const element = listRef.current;
    if (!element || wordWrap) {
      return undefined;
    }
    const roomNow = () => now.current.room ?? 0;
    const following = followColumns(element, {
      turned: wheelsSideways,
      advance: () => now.current.advance,
      perNotch,
      smooth,
      settles,
      scrolled: () => scrolled.current,
      room: roomNow,
      scrollTo,
    });
    across.current = following;
    return () => {
      following.stop();
      across.current = undefined;
    };
  }, [listRef, wordWrap, scrollTo]);
  const measureSideways = useCallback(() => {
    const element = listRef.current;
    if (!element || wordWrap) {
      setBox(undefined);
      return;
    }
    const next = readSideBox(element);
    setBox((last) => (last?.width === next.width ? last : next));
  }, [listRef, wordWrap]);
  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(measureSideways);
    observer.observe(element);
    return () => observer.disconnect();
  }, [listRef, measureSideways]);
  const scrolledNow = useCallback(() => scrolled.current, []);
  const glideTo = useCallback(
    (left: number) => {
      if (across.current) {
        across.current.scrollTo(left, true);
      } else {
        scrollTo(left);
      }
    },
    [scrollTo],
  );
  const held = useMemo<HeldScroller>(
    () => ({
      dragTo: (left) => across.current?.dragTo(left),
      dragEnd: () => across.current?.dragEnd(),
      stepBy: (steps) => across.current?.stepBy?.(steps) === true,
    }),
    [],
  );
  return {
    held,
    shown,
    dotColumns,
    room,
    placeCode,
    scrolledNow,
    scrollTo,
    glideTo,
    measureSideways,
  };
}
