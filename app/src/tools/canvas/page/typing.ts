import {
  characterDeleted,
  groupDeleted,
  movedSideways,
} from '../../../components/editing/page/textSteps';
import {
  editedPlainly,
  type PlainCaret,
} from '../../../components/editing/page/plainText';
import {
  rowEdgeMoved,
  rowMoved,
  type Wrapping,
} from '../../../components/editing/page/rowSteps';

export type Caret = PlainCaret;

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

export const movedRows = (
  caret: Caret,
  wrapping: Wrapping,
  forward: boolean,
  selects: boolean,
): Caret =>
  editedPlainly(caret, (state) => rowMoved(state, wrapping, forward, selects));

export const movedToRowEdge = (
  caret: Caret,
  wrapping: Wrapping,
  end: boolean,
  selects: boolean,
): Caret =>
  editedPlainly(caret, (state) => rowEdgeMoved(state, wrapping, end, selects));

export const allSelected = (caret: Caret): Caret => ({
  text: caret.text,
  anchor: 0,
  head: caret.text.length,
});

export function selectedText(caret: Caret): string {
  const { from, to } = spanOf(caret);
  return caret.text.slice(from, to);
}
