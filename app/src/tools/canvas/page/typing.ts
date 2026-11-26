import {
  characterDeleted,
  groupDeleted,
  movedSideways,
} from '../../../components/editing/page/textSteps';
import { editedPlainly } from '../../../components/editing/page/plainText';
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

export const deleted = (caret: Caret, forward: boolean, word: boolean): Caret =>
  editedPlainly(caret, (state) =>
    (word ? groupDeleted : characterDeleted)(state, forward),
  );

export function movedTo(caret: Caret, head: number, selects: boolean): Caret {
  const at = within(caret, head);
  return { text: caret.text, anchor: selects ? caret.anchor : at, head: at };
}

export const movedAcross = (
  caret: Caret,
  forward: boolean,
  word: boolean,
  selects: boolean,
): Caret =>
  editedPlainly(caret, (state) =>
    movedSideways(state, word ? 'group' : 'character', forward, selects),
  );

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
