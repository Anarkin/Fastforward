import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { alikeWithin } from './alikeWithin';

suite('Alike within a tolerance', () => {
  test('takes numbers as alike within the tolerance however deep they stand, as a mark placed on a device pixel and one on the 1/64 pixel below it stand 0.009 pixels apart at 175%', () => {
    alikeWithin(
      { breaks: [{ x: 1317.43, y: 36.56 }], edge: 12 },
      { breaks: [{ x: 1317.43, y: 36.57 }], edge: 12 },
      1 / 32,
    );
  });

  test('fails on a number further off than the tolerance, naming it as a deep comparison does', () => {
    assert.throws(
      () =>
        alikeWithin({ rows: [{ y: 36.5 }] }, { rows: [{ y: 36.57 }] }, 1 / 32),
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('36.5'),
    );
  });

  test('fails on anything but numbers that differ, and on a part one side lacks', () => {
    assert.throws(() => alikeWithin({ kind: 'blank' }, { kind: 'spaces' }, 1));
    assert.throws(() => alikeWithin([1, 2], [1, 2, 3], 1));
  });
});
