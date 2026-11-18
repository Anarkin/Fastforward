import { markedRowStarts } from './rowStarts';
import type { ColumnsIn, RowBreak } from '../../../lib/page/rowBreaks';
import { scratchRange } from '../../../lib/page/scratchRange';

export function laidOutRowStarts(
  code: HTMLElement,
  lineHeight: number,
  expected?: readonly number[],
): readonly number[] | undefined {
  const box = code.getBoundingClientRect();
  const rows = Math.round(box.height / lineHeight);
  if (rows < 2) {
    return [0];
  }
  const texts: { readonly node: Text; readonly start: number }[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) {
      texts.push({ node, start: length });
      length += node.length;
    }
  }
  const range = scratchRange();
  const textAt = (offset: number) => {
    let low = 0;
    let high = texts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (texts[middle].start <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const found = texts.at(low);
    return found && found.start <= offset ? found : undefined;
  };
  const rowOf = (offset: number) => {
    const at = textAt(offset);
    if (!at) {
      return 0;
    }
    range.setStart(at.node, offset - at.start);
    range.setEnd(at.node, Math.min(offset - at.start + 1, at.node.length));
    const rect = range.getBoundingClientRect();
    return Math.floor((rect.top + rect.height / 2 - box.top) / lineHeight);
  };
  return markedRowStarts(length, rows, rowOf, expected);
}

export interface LaidRows {
  readonly breaks: readonly RowBreak[];
  readonly starts: readonly number[] | undefined;
}

const noBreaks: readonly RowBreak[] = [];

export const unlaid: LaidRows = { breaks: noBreaks, starts: undefined };

const oneRow: LaidRows = { breaks: noBreaks, starts: [0] };

const mostRememberedBreaks = 20_000;

const rememberedBreaks = new WeakMap<ColumnsIn, Map<string, LaidRows>>();

const breaksKey = (text: string, columns: number, lineHeight: number) =>
  `${columns}\0${lineHeight}\0${text}`;

export function knownBreaks(
  text: string,
  columns: number,
  lineHeight: number,
  columnsIn: ColumnsIn | undefined,
): LaidRows | undefined {
  if (columnsIn === undefined) {
    return undefined;
  }
  if (columnsIn(text)(text.length) < columns) {
    return oneRow;
  }
  return rememberedBreaks
    .get(columnsIn)
    ?.get(breaksKey(text, columns, lineHeight));
}

export function rememberBreaks(
  text: string,
  columns: number,
  lineHeight: number,
  columnsIn: ColumnsIn,
  laid: LaidRows,
): void {
  let remembered = rememberedBreaks.get(columnsIn);
  if (remembered === undefined) {
    remembered = new Map();
    rememberedBreaks.set(columnsIn, remembered);
  }
  remembered.set(breaksKey(text, columns, lineHeight), laid);
  if (remembered.size > mostRememberedBreaks) {
    const [oldest] = remembered.keys();
    remembered.delete(oldest);
  }
}
