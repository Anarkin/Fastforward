import { tabCode } from '../shared/characterCodes';
import { graphemes, type Units } from './graphemes';
import { onceAText } from './onceAText';
import { tabSizeOf, tabStop } from './tabStops';
import type { TextWidths } from './textWidths';
import { joins, standsAlone } from './joined';

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

const lineFeed = 0x0a;

const carriageReturn = 0x0d;

const firstBeyondAscii = 0x80;

const isPlainAscii = (code: number) =>
  code < firstBeyondAscii &&
  code !== tabCode &&
  code !== lineFeed &&
  code !== carriageReturn;

const simple = /^[^\t\uD800-\uDBFF]*$/;

const printable = /^[ -~]*$/;

const plainAscii = /^[^\t\n\r\u0080-\uffff]*$/;

const tabbedAscii = /^[^\n\r\u0080-\uffff]*$/;

function tabbedColumns(
  text: string,
  from: number,
  to: number,
  size: number,
): number {
  let column = 0;
  let at = from;
  for (
    let tab = text.indexOf('\t', at);
    tab !== -1 && tab < to;
    tab = text.indexOf('\t', at)
  ) {
    column = tabStop(column + tab - at, size);
    at = tab + 1;
  }
  return column + to - at;
}

const joinsBeyondPlane = /^(?:\p{M}|[\u{E0020}-\u{E007F}])/u;

function joinsAfter(text: string, at: number): boolean {
  const next = text.charCodeAt(at + 1);
  return isHighSurrogate(next)
    ? joinsBeyondPlane.test(text.slice(at + 1, at + 3))
    : joins(next);
}

type Step = (
  at: number,
  column: number,
) => { readonly next: number; readonly column: number };

function stepsOf(text: string, widths: TextWidths | undefined): Step {
  let clusters: Units | undefined;
  const size = tabSizeOf(widths);
  return (at, column) => {
    const code = text.charCodeAt(at);
    if (code === tabCode) {
      return { next: at + 1, column: tabStop(column, size) };
    }
    if (widths === undefined || (isPlainAscii(code) && !joinsAfter(text, at))) {
      return {
        next: at + (isHighSurrogate(code) && at + 1 < text.length ? 2 : 1),
        column: column + 1,
      };
    }
    if (standsAlone(code, text.charCodeAt(at + 1))) {
      return {
        next: at + 1,
        column: column + widths.of(text[at] ?? '') / widths.char,
      };
    }
    clusters ??= graphemes.segment(text);
    const cluster = clusters.containing(at);
    return cluster === undefined
      ? { next: at + 1, column: column + 1 }
      : {
          next: cluster.index + cluster.segment.length,
          column: column + widths.of(cluster.segment) / widths.char,
        };
  };
}

const plainFor = (widths: TextWidths | undefined) =>
  widths === undefined ? simple : plainAscii;

export function columnAt(
  text: string,
  char: number,
  from = 0,
  widths?: TextWidths,
): number {
  if (plainFor(widths).test(text)) {
    return char - from;
  }
  if (tabbedAscii.test(text)) {
    return tabbedColumns(text, from, char, tabSizeOf(widths));
  }
  const step = stepsOf(text, widths);
  let column = 0;
  for (let at = from; at < char;) {
    const moved = step(at, column);
    at = moved.next;
    column = moved.column;
  }
  return column;
}

export function columnsOf(text: string, widths?: TextWidths): number {
  return columnAt(text, text.length, 0, widths);
}

export function columnsAlong(
  text: string,
  widths: TextWidths | undefined,
): (index: number) => number {
  if (plainFor(widths).test(text)) {
    return (index) => index;
  }
  const step = stepsOf(text, widths);
  let at = 0;
  let column = 0;
  return (index) => {
    if (index < at) {
      at = 0;
      column = 0;
    }
    while (at < index) {
      const moved = step(at, column);
      if (moved.next > index) {
        return column;
      }
      at = moved.next;
      column = moved.column;
    }
    return column;
  };
}

export const keptColumnsOf = onceAText(
  (text: string, widths: TextWidths | undefined) => columnsOf(text, widths),
);

export function widestColumns(
  text: string,
  widths: TextWidths | undefined,
  keptWhole: (line: string) => boolean,
): number {
  let widest = 0;
  const others: string[] = [];
  for (const line of text.split('\n')) {
    if (!keptWhole(line)) {
      continue;
    }
    if (printable.test(line)) {
      widest = Math.max(widest, line.length);
    } else {
      others.push(line);
    }
  }
  for (const line of others) {
    if (line.length * Math.max(2, tabSizeOf(widths)) > widest) {
      widest = Math.max(widest, columnsOf(line, widths));
    }
  }
  return widest;
}

export function placesWithin(
  text: string,
  from: number,
  to: number,
  startColumn: number,
  widths?: TextWidths,
): (readonly [at: number, column: number])[] {
  const step = stepsOf(text, widths);
  const places: (readonly [number, number])[] = [];
  let column = startColumn;
  for (let at = from; at < to;) {
    places.push([at - from, column]);
    const moved = step(at, column);
    at = moved.next;
    column = moved.column;
  }
  return places;
}

export function charAtColumn(
  text: string,
  from: number,
  to: number,
  startColumn: number,
  column: number,
  widths?: TextWidths,
): number {
  const step = stepsOf(text, widths);
  let at = from;
  let reached = startColumn;
  while (at < to) {
    const moved = step(at, reached);
    if (column < (reached + moved.column) / 2) {
      break;
    }
    at = moved.next;
    reached = moved.column;
  }
  return at;
}

export interface ColumnUnit {
  readonly from: number;
  readonly to: number;
  readonly column: number;
  readonly columns: number;
}

export function unitAtColumn(
  text: string,
  from: number,
  to: number,
  startColumn: number,
  column: number,
  widths?: TextWidths,
): ColumnUnit | undefined {
  const step = stepsOf(text, widths);
  let at = from;
  let reached = startColumn;
  while (at < to) {
    const moved = step(at, reached);
    if (column < moved.column) {
      return column < reached
        ? undefined
        : {
            from: at,
            to: moved.next,
            column: reached,
            columns: moved.column - reached,
          };
    }
    at = moved.next;
    reached = moved.column;
  }
  return undefined;
}

export function shownWithin(
  text: string,
  from: number,
  to: number,
  startColumn: number,
  endColumn: number,
  widths?: TextWidths,
): { readonly from: number; readonly to: number; readonly column: number } {
  if (plainFor(widths).test(text.slice(from, Math.min(to, from + endColumn)))) {
    const start = Math.min(to, from + startColumn);
    return {
      from: start,
      to: Math.min(to, Math.max(start, from + endColumn)),
      column: start - from,
    };
  }
  const step = stepsOf(text, widths);
  let at = from;
  let column = 0;
  while (at < to) {
    const moved = step(at, column);
    if (moved.column > startColumn) {
      break;
    }
    at = moved.next;
    column = moved.column;
  }
  const start = at;
  const startAt = column;
  while (at < to && column < endColumn) {
    const moved = step(at, column);
    at = moved.next;
    column = moved.column;
  }
  return { from: start, to: at, column: startAt };
}
