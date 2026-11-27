import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  leastOn,
  leastTick,
  matchMarks,
  spanTick,
  spanTicks,
  tickJoiner,
} from '../../../../lib/page/scrollbarTicks';

const rounded = (ticks: ReturnType<typeof spanTicks>) =>
  ticks.map(({ top, height }) => ({
    top: Math.round(top * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  }));

suite('Ticks on the track of a scrollbar', () => {
  test('draws ticks too close to tell apart as one, each at least the least tick tall, as those of a file viewed are', () => {
    const joined = tickJoiner(1 / 64);
    joined.add(0, 8 / 1024);
    joined.add(12 / 1024, 16 / 1024);
    joined.add(0.5, 544 / 1024);
    assert.deepStrictEqual(joined.ticks(), [
      { top: 0, height: 0.02734375 },
      { top: 0.5, height: 0.03125 },
    ]);
  });

  test('leaves ticks further apart than the least tick apart, as tall as they are, and joins nothing where no tick is the least', () => {
    const apart = tickJoiner(1 / 64);
    apart.add(0, 0.25);
    apart.add(0.5, 0.75);
    assert.deepStrictEqual(apart.ticks(), [
      { top: 0, height: 0.25 },
      { top: 0.5, height: 0.25 },
    ]);
    const exact = tickJoiner(0);
    exact.add(0, 0.125);
    exact.add(0.25, 0.375);
    assert.deepStrictEqual(exact.ticks(), [
      { top: 0, height: 0.125 },
      { top: 0.25, height: 0.125 },
    ]);
    assert.deepStrictEqual(tickJoiner(1 / 64).ticks(), []);
  });

  test('joins the ticks of lines that meet, though the end of one and the start of the next were worked out apart and differ by the rounding of their last digit, as the matches of the lines one after another of a text edited at 125% showed as ticks a hairline apart', () => {
    const row = 17.6;
    const total = 40 * row;
    const joined = tickJoiner(0);
    for (let line = 0; line < 40; line++) {
      joined.add((line * row) / total, (line * row + row) / total);
    }

    const ticks = joined.ticks();
    assert.deepStrictEqual(
      ticks.map(({ top, height }) => [top, Math.round(height * 1e9) / 1e9]),
      [[0, 1]],
    );
  });

  test('draws no more ticks than a track has room for at two pixels each, however many places there are to tick', () => {
    const track = 700;
    const joined = tickJoiner(leastTick / track);
    const places = 100_000;
    for (let place = 0; place < places; place += 2) {
      joined.add(place / places, (place + 1) / places);
    }
    assert.strictEqual(leastTick, 2);
    assert.ok(
      joined.ticks().length <= track / leastTick,
      String(joined.ticks().length),
    );
  });

  test('marks each span at its share of the height scrolled through, as tall as it is, so the thumb comes to stand at the mark once the span is at the top, two pixels of the track tall at least, joining marks that would touch, and nothing in a text of no height', () => {
    assert.deepStrictEqual(
      rounded(
        spanTicks(
          [
            { top: 0, bottom: 20 },
            { top: 500, bottom: 520 },
          ],
          1000,
          leastOn(400),
        ),
      ),
      [
        { top: 0, height: 0.02 },
        { top: 0.5, height: 0.02 },
      ],
    );
    assert.deepStrictEqual(
      rounded(
        spanTicks(
          [
            { top: 100, bottom: 101 },
            { top: 103, bottom: 104 },
            { top: 900, bottom: 901 },
          ],
          10_000,
          leastOn(200),
        ),
      ),
      [
        { top: 0.01, height: 0.01 },
        { top: 0.09, height: 0.01 },
      ],
    );
    assert.deepStrictEqual(
      spanTicks([{ top: 0, bottom: 20 }], 0, leastOn(400)),
      [],
    );
    assert.strictEqual(leastOn(0), 0);
  });

  test('places the current match where the thumb comes to stand once it is at the top, at least as tall as a tick, and nowhere without one or a height', () => {
    assert.deepStrictEqual(
      [
        spanTick({ top: 500, bottom: 520 }, 1000, leastOn(400)),
        spanTick({ top: 500, bottom: 501 }, 1000, leastOn(400)),
        spanTick({ top: 400, bottom: 600 }, 1000, 1 / 64),
        spanTick(undefined, 1000, leastOn(400)),
        spanTick({ top: 0, bottom: 20 }, 0, leastOn(400)),
      ],
      [
        { top: 0.5, height: 0.02 },
        { top: 0.5, height: 0.005 },
        { top: 0.4, height: 0.2 },
        undefined,
        undefined,
      ],
    );
  });

  test('marks the matches of a find and its current one in its own color over them, as the editor, the viewer and a Markdown preview mark theirs', () => {
    assert.deepStrictEqual(
      matchMarks(
        [
          { top: 0, bottom: 8 },
          { top: 12, bottom: 16 },
          { top: 512, bottom: 544 },
        ],
        { top: 512, bottom: 544 },
        1024,
        1 / 64,
      ),
      [
        { kind: 'match', top: 0, height: 0.02734375 },
        { kind: 'match', top: 0.5, height: 0.03125 },
        { kind: 'current', top: 0.5, height: 0.03125 },
      ],
    );
    assert.deepStrictEqual(
      matchMarks([{ top: 0, bottom: 8 }], undefined, 0, 1 / 64),
      [],
    );
  });
});
