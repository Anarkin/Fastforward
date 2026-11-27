import * as assert from 'node:assert';
import { history, undo } from '@codemirror/commands';
import { EditorState, Text, type Transaction } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  keptFrom,
  keptRestored,
  keptSent,
  keptUndone,
} from '../../../../../tools/editor/page/undecodedBytes';
import { keptPlaceholder } from '../../../../../tools/editor/shared/textMarks';

function opened(text: string) {
  const doc = Text.of(text.split('\n'));
  return EditorState.create({
    doc,
    extensions: [
      history(),
      keptUndone,
      keptFrom(doc, {
        keptBytes: [{ at: text.indexOf(keptPlaceholder), bytes: [0xe9] }],
      }),
    ],
  });
}

suite('Bytes kept by the editor', () => {
  test('moves the bytes kept along as text is typed before them, and forgets them once their character is deleted', () => {
    let state = opened(`a${keptPlaceholder}b`);
    state = state.update({ changes: { from: 0, insert: '>>' } }).state;
    assert.deepStrictEqual(keptSent(state), [{ at: 3, bytes: [0xe9] }]);
    state = state.update({ changes: { from: 3, to: 4 } }).state;
    assert.deepStrictEqual(keptSent(state), []);
  });

  test('keeps the bytes again once the deletion of their character is undone, and tells them, as the undo brought back the character alone and a save wrote it in the encoding', () => {
    let state = opened(`a${keptPlaceholder}b\nc`);
    state = state.update({ changes: { from: 0, to: 4 } }).state;
    assert.deepStrictEqual(keptSent(state), []);
    const undone: Transaction[] = [];
    undo({
      state,
      dispatch: (transaction) => {
        undone.push(transaction);
        state = transaction.state;
      },
    });
    assert.deepStrictEqual(keptSent(state), [{ at: 1, bytes: [0xe9] }]);
    assert.ok(keptRestored(undone));
  });
});
