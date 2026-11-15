import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { diffSelection } from '../../../../../tools/git/page/diffSelection';

suite('Large files fetched', () => {
  test('starts the requests of a diff over in another tab, though it shows the same commit and file', () => {
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', undefined),
      diffSelection('/b', 'working-tree', undefined),
    );
    assert.strictEqual(
      diffSelection('/a', 'working-tree', 'a.ts'),
      diffSelection('/a', 'working-tree', 'a.ts'),
    );
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', 'a.ts', 'staged'),
      diffSelection('/a', 'working-tree', 'a.ts', 'unstaged'),
    );
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', 'a.ts'),
      diffSelection('/a', 'working-tree', undefined),
    );
  });
});
