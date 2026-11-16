import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { diffRowPlace } from '../../../../../components/diff/page/diffRowClasses';

suite('Diff row heights', () => {
  test('places a row where it starts, telling its stripes how far down it is', () => {
    assert.deepStrictEqual(diffRowPlace(40, 17), {
      height: 17,
      top: 40,
      '--diff-row-top': '40px',
    });
  });
});
