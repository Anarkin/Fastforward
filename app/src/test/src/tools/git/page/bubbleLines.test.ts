import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bubbleLines,
  bubbleRowsAt,
  indentOf,
  linesAcross,
  measuredCrowds,
  sameRows,
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

  test('counts the lines of each commit in the room its row leaves after its lanes, and only of commits whose every bubble was measured', () => {
    const advances = new Map([['a', 50]]);
    const crowds = measuredCrowds(
      [
        { position: 4, keys: ['a', 'a'] },
        { position: 9, keys: ['a', 'a'] },
        { position: 12, keys: ['a', 'a'] },
        { position: 15, keys: ['a', 'b'] },
      ],
      advances,
      (position) => (position === 9 ? 4 : 3),
    );
    assert.deepStrictEqual(
      [...bubbleRowsAt(crowds, 2 * 50 + indentOf(3))],
      [
        [4, [2]],
        [9, [1, 1]],
        [12, [2]],
      ],
    );
    assert.deepStrictEqual([...bubbleRowsAt(crowds, 0)], []);
  });

  test('gives the same lines of two commits the same list, so rows counted again at another width are told apart from those counted alike by identity alone', () => {
    const crowds = measuredCrowds(
      [
        { position: 1, keys: ['a', 'a'] },
        { position: 2, keys: ['a', 'a'] },
      ],
      new Map([['a', 50]]),
      () => 1,
    );
    const wide = bubbleRowsAt(crowds, 500);
    assert.strictEqual(wide.get(1), wide.get(2));
    assert.ok(sameRows(wide, bubbleRowsAt(crowds, 400)));
    assert.ok(!sameRows(wide, bubbleRowsAt(crowds, 100)));
  });
});
