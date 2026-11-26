import {
  EditorSelection,
  EditorState,
  type Transaction,
} from '@codemirror/state';

export interface PlainCaret {
  readonly text: string;
  readonly anchor: number;
  readonly head: number;
}

const lineBreaks = /\r\n|\r|\n/g;

function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (const found of text.matchAll(lineBreaks)) {
    starts.push(found.index + found[0].length);
  }
  return starts;
}

const offsetIn = (
  state: EditorState,
  starts: readonly number[],
  at: number,
): number => {
  const line = state.doc.lineAt(at);
  return (starts[line.number - 1] ?? 0) + (at - line.from);
};

function positionIn(
  state: EditorState,
  starts: readonly number[],
  offset: number,
): number {
  let number = starts.length;
  while (number > 1 && (starts[number - 1] ?? 0) > offset) {
    number--;
  }
  const line = state.doc.line(number);
  return line.from + Math.min(line.length, offset - (starts[number - 1] ?? 0));
}

export function editedPlainly(
  caret: PlainCaret,
  edit: (state: EditorState) => Transaction | EditorSelection | undefined,
): PlainCaret {
  const starts = lineStartsOf(caret.text);
  const plain = EditorState.create({ doc: caret.text });
  const at = (offset: number) => positionIn(plain, starts, Math.max(0, offset));
  const state = plain.update({
    selection: EditorSelection.single(at(caret.anchor), at(caret.head)),
  }).state;
  const done = edit(state);
  if (done === undefined) {
    return caret;
  }
  if (done instanceof EditorSelection) {
    return {
      text: caret.text,
      anchor: offsetIn(state, starts, done.main.anchor),
      head: offsetIn(state, starts, done.main.head),
    };
  }
  let text = '';
  let kept = 0;
  done.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    text +=
      caret.text.slice(kept, offsetIn(state, starts, fromA)) +
      inserted.toString();
    kept = offsetIn(state, starts, toA);
  });
  text += caret.text.slice(kept);
  const after = lineStartsOf(text);
  const { main } = done.state.selection;
  return {
    text,
    anchor: offsetIn(done.state, after, main.anchor),
    head: offsetIn(done.state, after, main.head),
  };
}
