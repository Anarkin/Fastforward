import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  draggedFrom,
  jumpedTo,
  partAt,
  partsOf,
} from '../../../../lib/page/scrollbarParts';

const long = { scrollSize: 5000, clientSize: 286, scrolled: 1500 };

suite('The parts of a scrollbar', () => {
  test('gives a scrollbar a button as long as it is wide at either end, the track between them and the thumb where the browser draws it, as long as the share of what shows and no shorter than 24 pixels, so a press lands on the part it is seen on', () => {
    assert.deepStrictEqual(partsOf(286, 14, long), {
      start: { from: 0, length: 14 },
      track: { from: 14, length: 258 },
      thumb: { from: 14 + 74, length: 24 },
      end: { from: 272, length: 14 },
    });
    assert.deepStrictEqual(
      partsOf(300, 20, { scrollSize: 600, clientSize: 300, scrolled: 300 }),
      {
        start: { from: 0, length: 20 },
        track: { from: 20, length: 260 },
        thumb: { from: 150, length: 130 },
        end: { from: 280, length: 20 },
      },
    );
  });

  test('gives no thumb to a scrollbar with nothing to scroll or no room for one, and halves the buttons of a bar too short for both', () => {
    assert.strictEqual(
      partsOf(286, 14, { scrollSize: 286, clientSize: 286, scrolled: 0 }).thumb,
      undefined,
    );
    assert.strictEqual(partsOf(40, 14, long).thumb, undefined);
    assert.deepStrictEqual(partsOf(20, 14, long), {
      start: { from: 0, length: 10 },
      track: { from: 10, length: 0 },
      thumb: undefined,
      end: { from: 10, length: 10 },
    });
  });

  test('tells the part under a pointer along the bar, the track before the thumb apart from the track after it', () => {
    const parts = partsOf(286, 14, long);
    assert.deepStrictEqual(
      [0, 13.9, 14, 87, 88, 111.9, 112, 271.9, 272, 285].map((along) =>
        partAt(parts, along),
      ),
      [
        'start',
        'start',
        'before',
        'before',
        'thumb',
        'thumb',
        'after',
        'after',
        'end',
        'end',
      ],
    );
    assert.strictEqual(
      partAt(
        partsOf(286, 14, { scrollSize: 286, clientSize: 286, scrolled: 0 }),
        100,
      ),
      'before',
    );
  });

  test('scrolls to where the thumb is centered on a press of the track, as far as either end, and by as much as the pointer has moved a thumb held, however long the thumb', () => {
    const parts = partsOf(286, 14, long);
    assert.strictEqual(jumpedTo(parts, long, 14 + 12 + 117), 2357);
    assert.strictEqual(jumpedTo(parts, long, 0), 0);
    assert.strictEqual(jumpedTo(parts, long, 286), 4714);
    assert.strictEqual(
      jumpedTo(
        partsOf(286, 14, { scrollSize: 286, clientSize: 286, scrolled: 0 }),
        { scrollSize: 286, clientSize: 286, scrolled: 0 },
        100,
      ),
      0,
    );
    const drag = draggedFrom(parts, long, 100);
    assert.strictEqual(Math.round(drag(100)), 1500);
    assert.strictEqual(Math.round(drag(217)), 1500 + 2357);
    assert.strictEqual(Math.round(drag(100 - 234)), 1500 - 4714);
  });
});
