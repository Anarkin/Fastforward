import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bubbleLines,
  fittedLines,
  indentOf,
  linesAcross,
  measuredCrowds,
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

  test('takes as measured only the commits whose every bubble was measured, each with the room its lanes take from its row', () => {
    assert.deepStrictEqual(
      measuredCrowds(
        [
          { position: 4, keys: ['a', 'a'] },
          { position: 9, keys: ['a', 'a'] },
          { position: 15, keys: ['a', 'b'] },
        ],
        new Map([['a', 50]]),
        (position) => (position === 9 ? 4 : 3),
      ),
      [
        { position: 4, indent: indentOf(3), advances: [50, 50] },
        { position: 9, indent: indentOf(4), advances: [50, 50] },
      ],
    );
  });

  test('tells the span of rooms the lines hold in, from the widest line of several bubbles to the narrowest room that would take the next bubble onto a line, so a room in it needs no laying out anew', () => {
    const fitted = fittedLines([40, 60, 20.5, 30], 120);
    assert.deepStrictEqual(fitted, {
      lines: [2, 2],
      from: 100,
      until: 120.5,
    });
    assert.strictEqual(bubbleLines([40, 60, 20.5, 30], 100), fitted.lines);
    assert.notDeepStrictEqual(bubbleLines([40, 60, 20.5, 30], 99.99), [2, 2]);
    assert.notDeepStrictEqual(bubbleLines([40, 60, 20.5, 30], 120.5), [2, 2]);
    assert.deepStrictEqual(fittedLines([200, 10], 120), {
      lines: [1, 1],
      from: -Infinity,
      until: 210,
    });
    assert.deepStrictEqual(fittedLines([10, 10], 120), {
      lines: [2],
      from: 20,
      until: Infinity,
    });
  });

  test('gives the same lines of two commits the same list, so lines laid out anew are told apart from those laid out alike by identity alone', () => {
    assert.strictEqual(bubbleLines([50, 50], 500), bubbleLines([30, 30], 400));
    assert.notStrictEqual(
      bubbleLines([50, 50], 500),
      bubbleLines([50, 50], 90),
    );
  });
});
