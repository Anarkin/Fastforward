import * as assert from 'node:assert';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { suite, test } from 'vitest';
import { lineEdit, tokensIn } from '../../ui/editorColors';

function editOf(text: string, spec: TransactionSpec) {
  const startState = EditorState.create({ doc: text });
  const { changes, state } = startState.update(spec);
  return lineEdit({ changes, startState, state });
}

suite('Colors of the part of a line in view', () => {
  test('takes the tokens that reach into the part in view, those cut by its edges too, and none past them', () => {
    const tokens = Array.from({ length: 100_000 }, (_, at) => ({
      start: at * 5,
      end: at * 5 + 5,
      kind: 'keyword',
    }));
    assert.deepStrictEqual(
      tokensIn(tokens, 1003, 1012).map(({ start }) => start),
      [1000, 1005, 1010],
    );
    assert.deepStrictEqual(
      tokensIn(tokens, 1000, 1005).map(({ start }) => start),
      [1000],
    );
    assert.deepStrictEqual(tokensIn(tokens, 600_000, 600_010), []);
    assert.deepStrictEqual(tokensIn([], 0, 10), []);
  });
});

suite('Lines of the editor to color again', () => {
  test('colors again the line typed in, the lines an edit splits it into and the line deleting a line break joins', () => {
    assert.deepStrictEqual(
      editOf('one\ntwo\nthree', { changes: { from: 5, insert: 'x' } }),
      { from: 1, removed: 1, lines: ['txwo'] },
    );
    assert.deepStrictEqual(
      editOf('one\ntwo\nthree', { changes: { from: 5, insert: '\n' } }),
      { from: 1, removed: 1, lines: ['t', 'wo'] },
    );
    assert.deepStrictEqual(
      editOf('one\ntwo\nthree', { changes: { from: 3, to: 4 } }),
      { from: 0, removed: 2, lines: ['onetwo'] },
    );
  });

  test('colors again the lines from the first edit to the last of several made at once, as the cursors of a selection of many ranges make them', () => {
    assert.deepStrictEqual(
      editOf('a\nb\nc\nd', {
        changes: [
          { from: 0, insert: '>' },
          { from: 4, insert: '>' },
        ],
      }),
      { from: 0, removed: 3, lines: ['>a', 'b', '>c'] },
    );
  });
});
