import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  lookedPaths,
  maxLookedPathLength,
  maxLookedPaths,
} from '../../../../lib/shared/partLooks';

suite('The paths a page asks the looks of', () => {
  test('takes a list of paths', () => {
    assert.deepStrictEqual(lookedPaths(['C:\\Temp', '/home/me/a.txt']), [
      'C:\\Temp',
      '/home/me/a.txt',
    ]);
    assert.strictEqual(
      lookedPaths(Array.from({ length: maxLookedPaths }, () => 'C:\\'))?.length,
      maxLookedPaths,
    );
  });

  test('refuses anything else a forged message could send, as no list, an empty one, too many paths, a path that is no text, empty or too long', () => {
    for (const forged of [
      undefined,
      'C:\\Temp',
      {},
      [],
      Array.from({ length: maxLookedPaths + 1 }, () => 'C:\\'),
      [1],
      ['C:\\', null],
      [''],
      ['C:\\' + 'a'.repeat(maxLookedPathLength)],
    ]) {
      assert.strictEqual(lookedPaths(forged), undefined);
    }
  });
});
