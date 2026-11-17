import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { whatOf } from '../../../../../tools/commander/page/items';

suite('What the commander acts on', () => {
  test('names a single item by its whole path, so its parts are drawn and colored as the path of a side, and counts more', () => {
    assert.deepStrictEqual(whatOf(1, 'build.sh', 'C:\\Code\\scripts'), {
      name: 'C:\\Code\\scripts\\build.sh',
      path: 'file',
    });
    assert.deepStrictEqual(whatOf(1, 'build.sh', '/home/me'), {
      name: '/home/me/build.sh',
      path: 'file',
    });
    assert.deepStrictEqual(whatOf(3, 'build.sh', '/home/me'), {
      text: '3 items',
    });
  });

  test('names an item dropped from another app by its name alone, as only its name is known', () => {
    assert.deepStrictEqual(whatOf(1, 'build.sh'), {
      name: 'build.sh',
      path: 'file',
    });
  });
});
