import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowEnds } from '../../../../../tools/viewer/page/scrollThumbs';

suite('Scroll thumbs', () => {
  test('knows the first and the last screen of the rows of bytes, and rows that fit their view as both, where nothing is left to scroll', () => {
    assert.deepStrictEqual(
      [rowEnds(0, 90), rowEnds(45, 90), rowEnds(90, 90), rowEnds(0, 0)],
      [
        { atStart: true, atEnd: false },
        { atStart: false, atEnd: false },
        { atStart: false, atEnd: true },
        { atStart: true, atEnd: true },
      ],
    );
  });
});
