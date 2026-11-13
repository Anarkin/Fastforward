import * as assert from 'node:assert';
import { history, undo } from '@codemirror/commands';
import { EditorState, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  convertedTo,
  endingCounts,
  endingsField,
  endingsFrom,
  endingsSent,
  endingsUndone,
} from '../../../../tools/commander/page/editorEndings';

function opened(text: string) {
  const doc = Text.of(text.split('\n'));
  return EditorState.create({
    doc,
    extensions: [
      history(),
      endingsUndone,
      endingsFrom(doc, {
        ending: 'crlf',
        strayEndings: [{ at: text.indexOf('\n'), ending: 'lf' }],
      }),
    ],
  });
}

suite('Line endings of the editor', () => {
  test('counts the lines ending in each line ending, the file ending those not marked otherwise', () => {
    assert.deepStrictEqual(endingCounts(opened('a\nb\nc\nd')), {
      lf: 1,
      crlf: 2,
      cr: 0,
    });
  });

  test('moves the line ending marked otherwise along as text is typed before it, and forgets it once its line break is deleted', () => {
    const state = opened('a\nb\nc');
    const typed = state.update({ changes: { from: 0, insert: '>>' } }).state;
    assert.deepStrictEqual(endingsSent(typed.field(endingsField)), {
      ending: 'crlf',
      strayEndings: [{ at: 3, ending: 'lf' }],
    });
    const joined = typed.update({ changes: { from: 3, to: 4 } }).state;
    assert.deepStrictEqual(endingCounts(joined), { lf: 0, crlf: 1, cr: 0 });
  });

  test('ends every line in the line ending a file is converted to, and as it ended again once the conversion is undone', () => {
    let state = opened('a\nb\nc');
    state = state.update(convertedTo('lf')).state;
    assert.deepStrictEqual(endingCounts(state), { lf: 2, crlf: 0, cr: 0 });
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state;
      },
    });
    assert.deepStrictEqual(endingCounts(state), { lf: 1, crlf: 1, cr: 0 });
  });
});
