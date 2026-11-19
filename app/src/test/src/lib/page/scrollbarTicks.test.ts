import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { leastTick, tickJoiner } from '../../../../lib/page/scrollbarTicks';

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
});
