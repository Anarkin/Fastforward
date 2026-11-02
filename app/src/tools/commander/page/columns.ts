import { tabStop } from '../../../ui/wordWrap';

const tab = 9;

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

const simple = /^[^\t\uD800-\uDBFF]*$/;

function step(text: string, at: number, column: number) {
  const code = text.charCodeAt(at);
  return {
    next: at + (isHighSurrogate(code) && at + 1 < text.length ? 2 : 1),
    column: code === tab ? tabStop(column) : column + 1,
  };
}

export function columnAt(text: string, char: number, from = 0): number {
  if (simple.test(text)) {
    return char - from;
  }
  let column = 0;
  for (let at = from; at < char;) {
    const moved = step(text, at, column);
    at = moved.next;
    column = moved.column;
  }
  return column;
}

export function columnsOf(text: string): number {
  return columnAt(text, text.length);
}

export function shownWithin(
  text: string,
  from: number,
  to: number,
  startColumn: number,
  endColumn: number,
): { readonly from: number; readonly to: number; readonly column: number } {
  if (simple.test(text)) {
    const start = Math.min(to, from + startColumn);
    return {
      from: start,
      to: Math.min(to, Math.max(start, from + endColumn)),
      column: start - from,
    };
  }
  let at = from;
  let column = 0;
  while (at < to) {
    const moved = step(text, at, column);
    if (moved.column > startColumn) {
      break;
    }
    at = moved.next;
    column = moved.column;
  }
  const start = at;
  const startAt = column;
  while (at < to && column < endColumn) {
    const moved = step(text, at, column);
    at = moved.next;
    column = moved.column;
  }
  return { from: start, to: at, column: startAt };
}
