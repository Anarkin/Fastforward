import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  draggedFrom,
  furthestScroll,
  jumpedTo,
  partAt,
  partsOf,
} from '../../../../lib/page/scrollbarParts';

const long = { scrollSize: 5000, clientSize: 286, scrolled: 1500 };

const thumbAt = (scrolled: number, scale?: number) =>
  partsOf(286, 14, { ...long, scrolled }, scale).thumb;

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

  test('stands the thumb on the device pixel the browser cuts its place down to rather than the nearest, a pixel in once it is scrolled at all, at any scale, as a press on the first row of pixels of a thumb drawn a pixel higher than the page took it to be jumped as a press of the track', () => {
    assert.deepStrictEqual(thumbAt(1530), { from: 14 + 75, length: 24 });
    assert.deepStrictEqual(thumbAt(1), { from: 14 + 1, length: 24 });
    assert.deepStrictEqual(thumbAt(0), { from: 14, length: 24 });
    assert.deepStrictEqual(thumbAt(4714), { from: 14 + 234, length: 24 });
    assert.deepStrictEqual(thumbAt(1500, 1.5), {
      from: 14 + 111 / 1.5,
      length: 24,
    });
    assert.deepStrictEqual(thumbAt(1500, 2), {
      from: 14 + 148 / 2,
      length: 24,
    });
  });

  test('ends the thumb at the end of its track once scrolled to within half a pixel of the end the rounded size of what it scrolls gives, and only then, as a list ends between pixels at 125%, so a menu scrolled to its end stood at 5432.8 of a range rounded to 5433 and its thumb a device pixel short of the end the browser drew it at', () => {
    const menu = { scrollSize: 5913, clientSize: 480, scrolled: 5432.8 };
    const parts = partsOf(480, 18, menu, 1.25);
    assert.ok(parts.thumb);
    assert.ok(
      Math.abs(parts.end.from - (parts.thumb.from + parts.thumb.length)) <
        1 / 64,
      JSON.stringify(parts),
    );
    const before = partsOf(480, 18, { ...menu, scrolled: 5431 }, 1.25);
    assert.ok(before.thumb);
    assert.ok(
      before.end.from - (before.thumb.from + before.thumb.length) > 0,
      JSON.stringify(before),
    );
    const short = partsOf(
      480,
      18,
      { scrollSize: 483, clientSize: 480, scrolled: 2.1 },
      1.25,
    );
    assert.ok(short.thumb);
    assert.ok(
      short.end.from - (short.thumb.from + short.thumb.length) > 0,
      JSON.stringify(short),
    );
  });

  test('scrolls as far as the browser does, the end of what it scrolls and the end of its view each put on a device pixel where they stand, as a file viewed at 125% ended at 4026.4 while the sizes the browser rounds gave 4813 − 786 = 4027 and the exact ones 4026.66', () => {
    assert.strictEqual(
      furthestScroll({ start: 106.6, content: 4812.86, view: 786.2 }, 1.25),
      4026.4,
    );
    assert.strictEqual(
      furthestScroll({ start: 0, content: 100, view: 200 }, 1.25),
      0,
    );
  });

  test('ends the thumb at the end of its track once the scroller is as far as it scrolls, and only then, whatever the sizes it rounds say, as the thumb of a file viewed at its end at 125% stood a device pixel short of the end the browser drew it at', () => {
    const viewed = { scrollSize: 4813, clientSize: 786, scrolled: 4026.4 };
    const atEnd = partsOf(786.4, 17.6, { ...viewed, atEnd: true }, 1.25);
    assert.ok(atEnd.thumb);
    assert.ok(
      Math.abs(atEnd.end.from - (atEnd.thumb.from + atEnd.thumb.length)) <
        1 / 64,
      JSON.stringify(atEnd),
    );
    const short = partsOf(
      786.4,
      17.6,
      { ...viewed, scrolled: 4026.8, atEnd: false },
      1.25,
    );
    assert.ok(short.thumb);
    assert.ok(
      short.end.from - (short.thumb.from + short.thumb.length) > 0,
      JSON.stringify(short),
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
