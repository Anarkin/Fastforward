import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { afterPaint } from './afterPaint';

export interface RowRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly count: number;
}

export function sameRows(
  one: readonly number[] | undefined,
  other: readonly number[] | undefined,
): boolean {
  return (
    (one?.length ?? 0) === (other?.length ?? 0) &&
    one?.[0] === other?.[0] &&
    one?.at(-1) === other?.at(-1)
  );
}

export function rowsDrawnNow(
  drawn: readonly number[] | undefined,
  { startIndex, endIndex, count }: RowRange,
  around: readonly number[],
): number[] {
  const [aroundFirst] = around;
  const aroundLast = around.at(-1);
  if (count === 0 || aroundFirst === undefined || aroundLast === undefined) {
    return [];
  }
  const first = Math.max(drawn?.[0] ?? Infinity, aroundFirst);
  const last = Math.min(drawn?.at(-1) ?? -Infinity, aroundLast);
  return first <= startIndex && last >= endIndex
    ? Array.from({ length: last - first + 1 }, (_, index) => first + index)
    : [...around];
}

const rowBatch = 8;

export function aimedRange<Range extends RowRange>(
  range: Range,
  aimStart: number | undefined,
  batch = rowBatch,
): Range {
  if (range.count === 0) {
    return range;
  }
  const away = (aimStart ?? range.startIndex) - range.startIndex;
  if (Math.abs(away) > 5 * batch) {
    return range;
  }
  const ahead = Math.max(-2 * batch, Math.min(2 * batch, away));
  const start = range.startIndex + Math.min(0, ahead);
  const end = range.endIndex + Math.max(0, ahead);
  return {
    ...range,
    startIndex: Math.max(0, Math.floor(start / batch) * batch),
    endIndex: Math.min(
      range.count - 1,
      Math.ceil((end + 1) / batch) * batch - 1,
    ),
  };
}

export function useLaterRows<Range extends RowRange>(
  around: (range: Range) => number[],
): (range: Range) => number[] {
  const [extended, setExtended] = useState<readonly number[]>();
  const applied = useRef<readonly number[]>(undefined);
  const committed = useRef<readonly number[]>(undefined);
  const last = useRef<{
    readonly now: readonly number[];
    readonly around: readonly number[];
  }>(undefined);
  useLayoutEffect(() => {
    committed.current = last.current?.now;
    applied.current = extended;
  });
  const painted = useRef<ReturnType<typeof afterPaint>>(undefined);
  useEffect(() => {
    const later = afterPaint(() => {
      const rows = last.current;
      if (rows !== undefined && !sameRows(rows.around, committed.current)) {
        startTransition(() => setExtended(rows.around));
      }
    });
    painted.current = later;
    return later.cancel;
  }, []);
  useEffect(() => {
    if (!sameRows(last.current?.around, committed.current)) {
      painted.current?.ask();
    }
  });
  return (range) => {
    const wanted = around(range);
    const now = rowsDrawnNow(
      extended === applied.current ? committed.current : extended,
      range,
      wanted,
    );
    last.current = { now, around: wanted };
    return now;
  };
}
