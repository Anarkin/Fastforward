import { clusterBreak } from '../../../lib/page/graphemes';
import type { ScreenRow } from '../../../components/cells/page/lines';
import type { TextWidths } from '../../../lib/page/textWidths';
import { offsetAt, placeOf, rowEndOf, rowStartOf } from './nodeText';

export interface Caret {
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export const spanOf = ({ anchor, head }: Caret): Span => ({
  from: Math.min(anchor, head),
  to: Math.max(anchor, head),
});

const lineBreak = /[\r\n]/;

const blank = /^\s+$/u;

const wordCharacter = /[\p{L}\p{N}_]/u;

type Category = 'word' | 'space' | 'other';

function categoryOf(cluster: string): Category {
  if (blank.test(cluster)) {
    return 'space';
  }
  return wordCharacter.test(cluster) ? 'word' : 'other';
}

function wordStep(text: string, at: number, forward: boolean): number {
  let pos = at;
  let category: Category | undefined;
  while (forward ? pos < text.length : pos > 0) {
    const next = clusterBreak(text, pos, forward);
    const over = text.slice(Math.min(pos, next), Math.max(pos, next));
    if (lineBreak.test(over)) {
      return pos === at ? next : pos;
    }
    const reached = categoryOf(over);
    if (category === undefined || category === 'space') {
      category = reached;
    } else if (reached !== category) {
      return pos;
    }
    pos = next;
  }
  return pos;
}

const stepOf = (text: string, at: number, forward: boolean, word: boolean) =>
  word ? wordStep(text, at, forward) : clusterBreak(text, at, forward);

const within = (caret: Caret, at: number) =>
  Math.max(0, Math.min(caret.text.length, at));

function replaced(caret: Caret, { from, to }: Span, text: string): Caret {
  const at = from + text.length;
  return {
    text: caret.text.slice(0, from) + text + caret.text.slice(to),
    anchor: at,
    head: at,
  };
}

export const inserted = (caret: Caret, text: string): Caret =>
  replaced(caret, spanOf(caret), text);

export function deleted(caret: Caret, forward: boolean, word: boolean): Caret {
  const span = spanOf(caret);
  if (span.from !== span.to) {
    return replaced(caret, span, '');
  }
  const to = stepOf(caret.text, caret.head, forward, word);
  return replaced(
    caret,
    { from: Math.min(caret.head, to), to: Math.max(caret.head, to) },
    '',
  );
}

export function movedTo(caret: Caret, head: number, selects: boolean): Caret {
  const at = within(caret, head);
  return { text: caret.text, anchor: selects ? caret.anchor : at, head: at };
}

export function movedAcross(
  caret: Caret,
  forward: boolean,
  word: boolean,
  selects: boolean,
): Caret {
  const span = spanOf(caret);
  if (!selects && !word && span.from !== span.to) {
    return movedTo(caret, forward ? span.to : span.from, false);
  }
  return movedTo(caret, stepOf(caret.text, caret.head, forward, word), selects);
}

export function movedRows(
  caret: Caret,
  rows: readonly ScreenRow[],
  widths: TextWidths,
  by: number,
  selects: boolean,
): Caret {
  const place = placeOf(rows, caret.head, widths);
  if (place === undefined) {
    return caret;
  }
  const row = place.row + by;
  if (row < 0) {
    return movedTo(caret, 0, selects);
  }
  if (row >= rows.length) {
    return movedTo(caret, caret.text.length, selects);
  }
  return movedTo(
    caret,
    offsetAt(rows, { row, column: place.column }, widths),
    selects,
  );
}

export function movedToRowEdge(
  caret: Caret,
  rows: readonly ScreenRow[],
  widths: TextWidths,
  end: boolean,
  selects: boolean,
): Caret {
  const place = placeOf(rows, caret.head, widths);
  const row = place === undefined ? undefined : rows[place.row];
  if (row === undefined) {
    return caret;
  }
  return movedTo(caret, end ? rowEndOf(row) : rowStartOf(row), selects);
}

export const allSelected = (caret: Caret): Caret => ({
  text: caret.text,
  anchor: 0,
  head: caret.text.length,
});

export function selectedText(caret: Caret): string {
  const { from, to } = spanOf(caret);
  return caret.text.slice(from, to);
}
