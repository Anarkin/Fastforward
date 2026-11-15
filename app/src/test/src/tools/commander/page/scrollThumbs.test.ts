import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  grabbedAt,
  matchTicks,
} from '../../../../../tools/commander/page/scrollThumbs';

suite('Scroll thumbs', () => {
  test('holds a thumb pressed where it was pressed, and one whose track was pressed beside it by its middle', () => {
    assert.strictEqual(grabbedAt(35, { top: 30, height: 20 }), 5);
    assert.strictEqual(grabbedAt(30, { top: 30, height: 20 }), 0);
    assert.strictEqual(grabbedAt(50, { top: 30, height: 20 }), 20);
    assert.strictEqual(grabbedAt(80, { top: 30, height: 20 }), 10);
    assert.strictEqual(grabbedAt(10, { top: 30, height: 20 }), 10);
  });

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
});
