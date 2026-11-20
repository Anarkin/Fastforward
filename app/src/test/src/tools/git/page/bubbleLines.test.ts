import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bubbleLines,
  bubbleRowsOf,
  indentOf,
  linesAcross,
} from '../../../../../tools/git/page/bubbleLines';

suite('Bubble lines', () => {
  test('puts as many bubbles on a line as their advances fit in its width, a bubble wider than a line on a line of its own, as the browser breaks a line of inline blocks', () => {
    assert.deepStrictEqual(bubbleLines([40, 60, 20.5, 30], 120), [2, 2]);
    assert.deepStrictEqual(bubbleLines([40, 60, 20], 120), [3]);
    assert.deepStrictEqual(bubbleLines([40, 60, 20.015625], 120), [2, 1]);
    assert.deepStrictEqual(bubbleLines([200, 10, 300, 10], 120), [1, 1, 1, 1]);
    assert.deepStrictEqual(bubbleLines([], 120), []);
  });

  test('counts the lines only once every bubble was measured and the line has room', () => {
    const advances = new Map([
      ['a', 50],
      ['b', 50],
    ]);
    assert.deepStrictEqual(linesAcross(['a', 'b', 'a'], advances, 120), [2, 1]);
    assert.strictEqual(linesAcross(['a', 'c'], advances, 120), undefined);
    assert.strictEqual(linesAcross(['a'], advances, 0), undefined);
  });

  test('counts the lines of each commit in the room its row leaves after its lanes, those of a row the graph has not walked yet taken from its row loaded', () => {
    const advances = new Map([['a', 50]]);
    const width = 2 * 50 + indentOf(3);
    assert.deepStrictEqual(
      [
        ...bubbleRowsOf(
          [
            { position: 4, lanes: 3, keys: ['a', 'a'] },
            { position: 9, lanes: 4, keys: ['a', 'a'] },
            { position: 12, lanes: 0, keys: ['a', 'a'] },
            { position: 15, lanes: 1, keys: ['a', 'b'] },
          ],
          advances,
          width,
          (position) => (position === 12 ? 3 : 1),
        ),
      ],
      [
        [4, [2]],
        [9, [1, 1]],
        [12, [2]],
      ],
    );
  });
});
