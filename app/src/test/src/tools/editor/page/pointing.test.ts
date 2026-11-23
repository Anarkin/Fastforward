import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import type { TextWidths } from '../../../../../lib/page/textWidths';
import { bracketPairs } from '../../../../../tools/editor/page/brackets';
import { blockBetween } from '../../../../../tools/editor/page/pointing';

const wide: TextWidths = {
  char: 1,
  of: (cluster) => (/[中文]/.test(cluster) ? 2 : 1),
};

const stateOf = (text: string, cursor = 0) =>
  EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(cursor),
  });

const ranged = (
  state: EditorState,
  from: [number, number],
  to: [number, number],
) =>
  blockBetween(
    state,
    { widths: wide },
    { line: from[0], column: from[1] },
    { line: to[0], column: to[1] },
  ).map(({ anchor, head }) => [anchor, head]);

suite('Pointing at the text edited', () => {
  test('selects a block of columns over the lines dragged across, a stretch of each from the column pressed at to the column under the pointer, by the columns its characters take rather than their count, leaving out a line that ends before the block starts', () => {
    const state = stateOf(['abcdef', 'a中cdef', 'ab', 'abcdefgh'].join('\n'));

    assert.deepStrictEqual(ranged(state, [1, 2], [4, 5]), [
      [2, 5],
      [9, 11],
      [16, 16],
      [19, 22],
    ]);
    assert.deepStrictEqual(ranged(state, [4, 5], [3, 3]), [[22, 20]]);
    assert.deepStrictEqual(ranged(state, [1, 3], [1, 3]), [[3, 3]]);
  });

  test('pairs the bracket beside each cursor with the one that matches it, the one before the cursor first, and marks none beside a bracket that matches nothing or while text is selected', () => {
    assert.deepStrictEqual(bracketPairs(stateOf('a(b[c])d', 2)), [
      { from: 1, to: 2 },
      { from: 6, to: 7 },
    ]);
    assert.deepStrictEqual(bracketPairs(stateOf('a(b[c])d', 7)), [
      { from: 1, to: 2 },
      { from: 6, to: 7 },
    ]);
    assert.deepStrictEqual(bracketPairs(stateOf('a(b', 2)), []);
    assert.deepStrictEqual(
      bracketPairs(
        EditorState.create({
          doc: 'a(b)c',
          selection: EditorSelection.range(1, 2),
        }),
      ),
      [],
    );
  });
});
