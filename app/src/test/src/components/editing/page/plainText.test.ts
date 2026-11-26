import * as assert from 'node:assert';
import {
  EditorSelection,
  EditorState,
  type Transaction,
} from '@codemirror/state';
import { suite, test } from 'vitest';
import { editedPlainly } from '../../../../../components/editing/page/plainText';
import {
  characterDeleted,
  groupDeleted,
  movedSideways,
} from '../../../../../components/editing/page/textSteps';

const lineFeed = String.fromCharCode(10);
const carriageReturn = String.fromCharCode(13);

const texts = [
  'one two  three',
  `one${lineFeed}two`,
  'a.b(c) d_e',
  'éte \u{1F437}x',
  `  lead${lineFeed}${lineFeed}  end `,
];

const edits = {
  backward: (state: EditorState) => characterDeleted(state, false),
  forward: (state: EditorState) => characterDeleted(state, true),
  wordBackward: (state: EditorState) => groupDeleted(state, false),
  wordForward: (state: EditorState) => groupDeleted(state, true),
  left: (state: EditorState) => movedSideways(state, 'character', false, false),
  right: (state: EditorState) => movedSideways(state, 'character', true, false),
  wordLeft: (state: EditorState) => movedSideways(state, 'group', false, true),
  wordRight: (state: EditorState) => movedSideways(state, 'group', true, true),
};

function editorDid(
  text: string,
  at: number,
  edit: (state: EditorState) => Transaction | EditorSelection | undefined,
): { text: string; anchor: number; head: number } {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.single(at),
  });
  const done = edit(state);
  if (done instanceof EditorSelection) {
    return { text, anchor: done.main.anchor, head: done.main.head };
  }
  const reached = done === undefined ? state : done.state;
  return {
    text: reached.doc.toString(),
    anchor: reached.selection.main.anchor,
    head: reached.selection.main.head,
  };
}

suite('A plain text edited as the editor edits', () => {
  test('gives the text, the anchor and the head the editor gives for every step and delete, at every place of a text', () => {
    for (const text of texts) {
      for (let at = 0; at <= text.length; at++) {
        for (const [name, edit] of Object.entries(edits)) {
          const caret = { text, anchor: at, head: at };
          const plain = editedPlainly(caret, edit);
          const expected = editorDid(text, at, edit);
          const atCluster =
            EditorState.create({ doc: text }).doc.sliceString(0, at).length ===
            at;
          if (atCluster) {
            assert.deepStrictEqual(
              plain,
              expected,
              `${name} at ${at} of ${JSON.stringify(text)}`,
            );
          }
        }
      }
    }
  });

  test('keeps a carriage return and a line feed as one line break of the text, deleting them together and keeping every other line break as it was', () => {
    const text = `ab${carriageReturn}${lineFeed}cd${carriageReturn}${lineFeed}ef`;
    assert.deepStrictEqual(
      editedPlainly({ text, anchor: 4, head: 4 }, edits.backward),
      {
        text: `abcd${carriageReturn}${lineFeed}ef`,
        anchor: 2,
        head: 2,
      },
    );
    assert.deepStrictEqual(
      editedPlainly({ text, anchor: 6, head: 6 }, edits.right),
      { text, anchor: 8, head: 8 },
    );
    assert.deepStrictEqual(
      editedPlainly({ text, anchor: 2, head: 2 }, edits.wordForward),
      { text: `abcd${carriageReturn}${lineFeed}ef`, anchor: 2, head: 2 },
    );
  });
});
