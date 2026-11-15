import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shareOf } from '../../../../../tools/commander/page/sideShare';

suite('Commander side share', () => {
  test('splits the sides where the divider is dragged, leaving each some room, and evenly before it is laid out', () => {
    assert.strictEqual(shareOf(300, 1000), 0.3);
    assert.strictEqual(shareOf(10, 1000), 0.15);
    assert.strictEqual(shareOf(990, 1000), 0.85);
    assert.strictEqual(shareOf(10, 0), 0.5);
  });
});
