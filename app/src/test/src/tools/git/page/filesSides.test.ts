import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { listsNothing } from '../../../../../tools/git/page/filesSides';
import { fileChange as change } from '../../../../helpers/gitValues';

suite('Files column', () => {
  test('lists nothing once loaded with no file changed and none to show unchanged, unless staged and unstaged changes are listed apart', () => {
    const nothing = {
      files: [],
      staged: undefined,
      allPaths: undefined,
      loading: false,
    };
    assert.strictEqual(listsNothing(nothing), true);
    assert.strictEqual(listsNothing({ ...nothing, allPaths: [] }), true);
    assert.strictEqual(listsNothing({ ...nothing, loading: true }), false);
    assert.strictEqual(
      listsNothing({ ...nothing, files: [change('a.ts')] }),
      false,
    );
    assert.strictEqual(listsNothing({ ...nothing, allPaths: ['a.ts'] }), false);
    assert.strictEqual(listsNothing({ ...nothing, staged: [] }), false);
  });
});
