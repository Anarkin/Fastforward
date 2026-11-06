import { tabSize, tabStop } from '../../../ui/wordWrap';
import type { TextWidths } from '../../../ui/textWidths';

const tab = 9;

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

const isPrintableAscii = (code: number) => code >= 0x20 && code < 0x7f;

const simple = /^[^\t\uD800-\uDBFF]*$/;

const printable = /^[ -~]*$/;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type Step = (
  at: number,
  column: number,
) => { readonly next: number; readonly column: number };

function stepsOf(text: string, widths: TextWidths | undefined): Step {
  let clusters: Intl.Segments | undefined;
  return (at, column) => {
    const code = text.charCodeAt(at);
    if (code === tab) {
      return { next: at + 1, column: tabStop(column) };
    }
    if (widths === undefined || isPrintableAscii(code)) {
      return {
        next: at + (isHighSurrogate(code) && at + 1 < text.length ? 2 : 1),
        column: column + 1,
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
  widths === undefined ? simple : printable;

export function columnAt(
  text: string,
  char: number,
  from = 0,
  widths?: TextWidths,
): number {
  if (plainFor(widths).test(text)) {
    return char - from;
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

const mostColumnsAUnit = tabSize;

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
    if (line.length * mostColumnsAUnit > widest) {
      widest = Math.max(widest, columnsOf(line, widths));
    }
  }
  return widest;
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
