import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  devicePixelSize,
  snapOffset,
  watchDevicePixels,
  type DisplayWindow,
} from '../../ui/devicePixels';

const ratios = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3];

class FakeQuery extends EventTarget {
  constructor(readonly media: string) {
    super();
  }
}

function fakeDisplay(ratio: number) {
  const queries: FakeQuery[] = [];
  const properties = new Map<string, string>();
  const display: DisplayWindow & { devicePixelRatio: number } = {
    devicePixelRatio: ratio,
    matchMedia: (media) => {
      const query = new FakeQuery(media);
      queries.push(query);
      return query;
    },
    document: {
      documentElement: {
        style: { setProperty: (name, value) => properties.set(name, value) },
      },
    },
  };
  return { display, queries, properties };
}

suite('Device pixels', () => {
  test('sizes a device pixel in CSS pixels', () => {
    assert.deepStrictEqual(
      ratios.map((ratio) => devicePixelSize(ratio)),
      ratios.map((ratio) => `${1 / ratio}px`),
    );
  });

  test('moves a position to the nearest whole device pixel, by at most half of one', () => {
    for (const ratio of ratios) {
      for (const position of [0, 14, 17.5, 123.4, 683.99, 1000.3]) {
        const offset = snapOffset(position, ratio);
        const device = (position + offset) * ratio;
        assert.ok(
          Math.abs(device - Math.round(device)) < 0.01,
          `${position} at ${ratio}`,
        );
        assert.ok(Math.abs(offset * ratio) <= 0.51);
      }
    }
  });

  test('leaves a position less than a hundredth of a device pixel off the grid where it is, as positions are measured no finer and glyphs are placed far coarser, so measuring again finds nothing to move', () => {
    assert.strictEqual(snapOffset(684.0000152587891, 1.25), 0);
    assert.strictEqual(snapOffset(684.0000457763672, 1.25), 0);
    assert.ok(Math.abs(snapOffset(684.01, 1.25) + 0.01) < 1e-9);
  });

  test('moves a position halfway between two device pixels always to the lower one, so measuring it again, a hair either side, cannot flip it', () => {
    for (const position of [13.6, 13.6 + 1e-5, 13.6 - 1e-5, 684.4 + 1e-5]) {
      const offset = snapOffset(position, 1.25);
      assert.strictEqual(
        Math.round((position + offset) * 1.25),
        Math.floor(position * 1.25 + 0.5 - 0.02),
        String(position),
      );
    }
  });

  test('keeps the size of a device pixel on the page, and tells when the display scale changes, having updated it first', () => {
    const { display, queries, properties } = fakeDisplay(1.25);
    const seen: (string | undefined)[] = [];
    const stop = watchDevicePixels(
      () => seen.push(properties.get('--device-pixel')),
      display,
    );
    assert.strictEqual(properties.get('--device-pixel'), '0.8px');
    display.devicePixelRatio = 1.5;
    queries[0].dispatchEvent(new Event('change'));
    assert.deepStrictEqual(seen, [`${1 / 1.5}px`]);
    assert.deepStrictEqual(
      queries.map((query) => query.media),
      ['(resolution: 1.25dppx)', '(resolution: 1.5dppx)'],
    );
    stop();
    queries[1].dispatchEvent(new Event('change'));
    assert.strictEqual(seen.length, 1);
  });
});
