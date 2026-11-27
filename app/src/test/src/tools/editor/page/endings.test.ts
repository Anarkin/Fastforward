import * as assert from 'node:assert';
import { history, undo } from '@codemirror/commands';
import { EditorState, Text, type Transaction } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  conversionsOf,
  convertedTo,
  endingCounts,
  endingsChanged,
  endingsField,
  endingsFrom,
  endingsSent,
  endingsUndone,
} from '../../../../../tools/editor/page/endings';

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

const offered = (counts: { lf: number; crlf: number; cr: number }) =>
  conversionsOf(counts).map(
    ({ ending, label, changes }) =>
      `${changes ? '' : '(off) '}${label} ${ending}`,
  );

suite('Line endings of the editor', () => {
  test('offers to convert every line ending to LF or CRLF, spelled out, a conversion that would change no line break marked so', () => {
    assert.deepStrictEqual(offered({ lf: 3, crlf: 0, cr: 0 }), [
      '(off) Convert all line endings to LF lf',
      'Convert all line endings to CRLF crlf',
    ]);
    assert.deepStrictEqual(offered({ lf: 0, crlf: 2, cr: 0 }), [
      'Convert all line endings to LF lf',
      '(off) Convert all line endings to CRLF crlf',
    ]);
    assert.deepStrictEqual(offered({ lf: 2, crlf: 1, cr: 0 }), [
      'Convert all line endings to LF lf',
      'Convert all line endings to CRLF crlf',
    ]);
    assert.deepStrictEqual(offered({ lf: 0, crlf: 0, cr: 4 }), [
      'Convert all line endings to LF lf',
      'Convert all line endings to CRLF crlf',
    ]);
    assert.deepStrictEqual(offered({ lf: 0, crlf: 0, cr: 0 }), [
      '(off) Convert all line endings to LF lf',
      '(off) Convert all line endings to CRLF crlf',
    ]);
  });

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

  test('marks the line ending marked otherwise again once the deletion of its line break is undone, and tells it, as the undo brought back a line break in the line ending of the file', () => {
    let state = opened('a\nb\nc');
    state = state.update({ changes: { from: 0, to: 3 } }).state;
    assert.deepStrictEqual(endingCounts(state), { lf: 0, crlf: 1, cr: 0 });
    const undone: Transaction[] = [];
    undo({
      state,
      dispatch: (transaction) => {
        undone.push(transaction);
        state = transaction.state;
      },
    });
    assert.deepStrictEqual(endingsSent(state.field(endingsField)), {
      ending: 'crlf',
      strayEndings: [{ at: 1, ending: 'lf' }],
    });
    assert.ok(endingsChanged(undone));
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
