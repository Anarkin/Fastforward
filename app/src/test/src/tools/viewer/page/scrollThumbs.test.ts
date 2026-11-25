import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  currentTick,
  matchTicks,
  rowEnds,
} from '../../../../../tools/viewer/page/scrollThumbs';

suite('Scroll thumbs', () => {
  test('ticks matches too close to tell apart once, each at least the least tick tall, so a file of many matches draws a tick per few pixels at most', () => {
    assert.deepStrictEqual(
      matchTicks(
        [
          { start: 0, end: 8 },
          { start: 12, end: 16 },
          { start: 512, end: 544 },
        ],
        1024,
        1 / 64,
      ),
      [
        { top: 0, height: 0.02734375 },
        { top: 0.5, height: 0.03125 },
      ],
    );
    assert.deepStrictEqual(matchTicks([{ start: 0, end: 8 }], 0, 1 / 64), []);
  });

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

  test('places the current match on the track where the thumb comes to stand once it is at the top, at least as tall as a tick, and nowhere without one or a file', () => {
    assert.deepStrictEqual(
      [
        currentTick({ start: 400, end: 404 }, 1000, 1 / 64),
        currentTick({ start: 400, end: 600 }, 1000, 1 / 64),
        currentTick(undefined, 1000, 1 / 64),
        currentTick({ start: 0, end: 4 }, 0, 1 / 64),
      ],
      [
        { top: 0.4, height: 1 / 64 },
        { top: 0.4, height: 0.2 },
        undefined,
        undefined,
      ],
    );
  });
});
