import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { grabbedAt } from '../../../../../tools/commander/page/scrollThumbs';

suite('Scroll thumbs', () => {
  test('holds a thumb pressed where it was pressed, and one whose track was pressed beside it by its middle', () => {
    assert.strictEqual(grabbedAt(35, { top: 30, height: 20 }), 5);
    assert.strictEqual(grabbedAt(30, { top: 30, height: 20 }), 0);
    assert.strictEqual(grabbedAt(50, { top: 30, height: 20 }), 20);
    assert.strictEqual(grabbedAt(80, { top: 30, height: 20 }), 10);
    assert.strictEqual(grabbedAt(10, { top: 30, height: 20 }), 10);
  });
});
