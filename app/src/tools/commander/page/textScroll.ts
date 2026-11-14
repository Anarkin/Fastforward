import { useEffect, useState } from 'react';
import { maxColoredBytes, type TextEncoding } from '../shared/protocol';
import { wholeText, type WholeText } from './textColors';
import { type Thumb } from './scrollThumbs';
import type { Viewing } from './commanderState';
import { useCommanderActions } from './store';

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Loaded {
  readonly rows: readonly Span[];
  readonly top: number;
}

export function topWithin(top: number, count: number, screen: number): number {
  return Math.max(0, Math.min(top, count - screen));
}

export function scrolled(
  loaded: Loaded,
  by: number,
  screen: number,
  size: number,
): { readonly top: number; readonly refill: boolean } | undefined {
  const first = loaded.rows[0];
  const last = loaded.rows.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const atStart = first.start === 0;
  const atEnd = last.end >= size;
  const lastTop = Math.max(0, loaded.rows.length - screen);
  const wanted = loaded.top + by;
  if ((wanted < 0 && !atStart) || (wanted > lastTop && !atEnd)) {
    return undefined;
  }
  const top = Math.max(0, Math.min(wanted, lastTop));
  return {
    top,
    refill: (!atStart && top < screen) || (!atEnd && top > lastTop - screen),
  };
}

export function bytesPerRow(rows: readonly Span[]): number | undefined {
  const first = rows[0];
  const last = rows.at(-1);
  return first === undefined || last === undefined
    ? undefined
    : Math.max(1, (last.end - first.start) / rows.length);
}

export function lastScreenStart(
  size: number,
  screen: number,
  perRow: number,
  known: number | undefined,
): number {
  return known ?? Math.max(0, size - screen * perRow);
}

export function textThumb(
  loaded: Loaded,
  screen: number,
  size: number,
  perRow: number | undefined,
  lastTop: number | undefined,
): Thumb | undefined {
  const first = loaded.rows[loaded.top];
  if (first === undefined || size <= 0) {
    return undefined;
  }
  const bytes = perRow ?? bytesPerRow(loaded.rows) ?? 1;
  const end = lastScreenStart(size, screen, bytes, lastTop);
  return {
    start: end > 0 ? Math.min(1, first.start / end) : 0,
    length: Math.min(1, screen / (size / bytes)),
  };
}

export function useWholeText(
  viewing: Viewing,
  wanted: boolean,
  encoding: TextEncoding,
): WholeText | undefined {
  const [text, setText] = useState<WholeText>();
  const { readWholeText } = useCommanderActions();
  useEffect(() => {
    const { tab, size } = viewing;
    if (!wanted || size === undefined || size > maxColoredBytes) {
      return undefined;
    }
    return readWholeText(tab, encoding, (read) => setText(wholeText(read)));
  }, [wanted, viewing, encoding, readWholeText]);
  return text;
}
