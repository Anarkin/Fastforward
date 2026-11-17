import type { Virtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import type { DiffRow } from './rows';
import type { WrapColumns } from './rowMeasures';

export function rowAnchors(
  rows: readonly DiffRow[],
  lines: readonly (readonly string[])[],
): (readonly string[])[] {
  const hunks = new Map<number, number>();
  return rows.map((row, index) => {
    if (lines[index].length > 0) {
      return lines[index];
    }
    if (row.kind === 'hunk') {
      const hunk = (hunks.get(row.file) ?? 0) + 1;
      hunks.set(row.file, hunk);
      return [`${row.file}:hunk:${hunk}`];
    }
    return ['file' in row ? `${row.file}:${row.kind}` : row.kind];
  });
}

export interface ScrollAnchor {
  readonly shows: readonly string[];
  readonly fraction: number;
}

type Laid = readonly { readonly start: number; readonly size: number }[];

const readerOffset = 0.5;

export function scrollAnchor(
  rows: Laid,
  shown: readonly (readonly string[])[],
  scrollTop: number,
): ScrollAnchor | undefined {
  const seen = scrollTop + readerOffset;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].start <= seen) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const row = rows.at(low);
  const shows = shown.at(low);
  if (!row || !shows) {
    return undefined;
  }
  return {
    shows,
    fraction:
      row.size > 0 ? Math.max(0, (scrollTop - row.start) / row.size) : 0,
  };
}

export function anchoredScrollTop(
  anchor: ScrollAnchor,
  rows: Laid,
  shown: readonly (readonly string[])[],
  line: number,
): number | undefined {
  const index = shown.findIndex((shows) =>
    shows.some((id) => anchor.shows.includes(id)),
  );
  const row = index === -1 ? undefined : rows.at(index);
  return (
    row &&
    row.start +
      Math.min(
        anchor.fraction * row.size,
        Math.max(0, row.size - Math.min(row.size, line) / 2),
      )
  );
}

export function useScrollAnchor({
  list,
  virtualizer,
  shown,
  split,
  wordWrap,
  columns,
  line,
}: {
  readonly list: RefObject<HTMLDivElement | null>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly shown: readonly (readonly string[])[];
  readonly split: boolean;
  readonly wordWrap: boolean;
  readonly columns: WrapColumns | undefined;
  readonly line: number;
}): void {
  const layoutKey = `${split}:${wordWrap ? `${columns?.left}:${columns?.right}` : ''}`;
  const anchor = useRef<{ key: string; at: ScrollAnchor | undefined }>(
    undefined,
  );
  const drawn = useRef(shown);
  const anchorNow = useEffectEvent(() => {
    const element = list.current;
    if (
      element === null ||
      anchor.current?.key !== layoutKey ||
      drawn.current !== shown
    ) {
      return;
    }
    anchor.current = {
      key: layoutKey,
      at: scrollAnchor(virtualizer.measurementsCache, shown, element.scrollTop),
    };
  });
  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const scrolled = () => anchorNow();
    element.addEventListener('scroll', scrolled, { passive: true });
    return () => element.removeEventListener('scroll', scrolled);
  }, [list]);
  useLayoutEffect(() => {
    drawn.current = shown;
    const last = anchor.current;
    if (last?.at !== undefined && last.key !== layoutKey) {
      anchor.current = { key: layoutKey, at: last.at };
      const top = anchoredScrollTop(
        last.at,
        virtualizer.measurementsCache,
        shown,
        line,
      );
      if (top !== undefined) {
        virtualizer.scrollToOffset(top);
      }
      return;
    }
    anchor.current = {
      key: layoutKey,
      at: scrollAnchor(
        virtualizer.measurementsCache,
        shown,
        list.current?.scrollTop ?? 0,
      ),
    };
  });
}
