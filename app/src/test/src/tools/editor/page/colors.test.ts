import * as assert from 'node:assert';
import { EditorState, Text, type TransactionSpec } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  coloredLinesOf,
  keepColoredLines,
  lineEdit,
  linesMeet,
} from '../../../../../tools/editor/page/colors';

function editOf(text: string, spec: TransactionSpec) {
  const startState = EditorState.create({ doc: text });
  const { changes, state } = startState.update(spec);
  return lineEdit({ changes, startState, state });
}

suite('Colors of the part of a line in view', () => {
  test('draws the editor anew for the colors of lines it shows, the first and last of them too, and leaves it alone for those of lines out of view, as the colors of a long file coming part by part drew it anew with each part while it scrolled', () => {
    const shown = { first: 100, last: 180 };
    assert.deepStrictEqual(
      [
        linesMeet({ from: 0, count: 100 }, shown),
        linesMeet({ from: 0, count: 101 }, shown),
        linesMeet({ from: 120, count: 10 }, shown),
        linesMeet({ from: 180, count: 500 }, shown),
        linesMeet({ from: 181, count: 500 }, shown),
        linesMeet({ from: 150, count: 0 }, shown),
      ],
      [false, true, true, true, false, false],
    );
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

suite('Colors of a line of the editor', () => {
  test('gives the lines colored back for the very text and language they were colored for, as a copy, and none for another text or language', () => {
    const doc = Text.of(['one', 'two']);
    const lines = [[{ start: 0, end: 3, kind: 'keyword' as const }], undefined];
    keepColoredLines(doc, 'ts', lines);

    const back = coloredLinesOf(doc, 'ts');
    assert.deepStrictEqual(back, lines);
    assert.notStrictEqual(back, lines);
    assert.strictEqual(coloredLinesOf(doc, 'js'), undefined);
    assert.strictEqual(
      coloredLinesOf(Text.of(['one', 'two']), 'ts'),
      undefined,
    );
  });
});
