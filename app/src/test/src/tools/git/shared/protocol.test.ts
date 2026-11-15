import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  commitPageSize,
  pageStart,
} from '../../../../../tools/git/shared/protocol';

suite('Commit pages', () => {
  test('starts the page an index is on', () => {
    assert.strictEqual(pageStart(0), 0);
    assert.strictEqual(pageStart(commitPageSize - 1), 0);
    assert.strictEqual(pageStart(commitPageSize), commitPageSize);
    assert.strictEqual(
      pageStart(2 * commitPageSize + commitPageSize / 2),
      2 * commitPageSize,
    );
  });
});
