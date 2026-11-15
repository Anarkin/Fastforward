import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  changesTree,
  changesTreeRows,
} from '../../../../../tools/git/page/changesRows';
import { filesRows } from '../../../../../tools/git/page/filesRows';
import {
  filesCursor,
  filesReveal,
} from '../../../../../tools/git/page/filesCursor';
import { revealAgain } from '../../../../../lib/page/listRows';
import { fileChange as change } from '../../../../helpers/gitValues';

function revealAt(closed: string[], cursor: string) {
  return {
    key: cursor,
    rows: filesReveal(
      filesRows([
        {
          area: undefined,
          header: true,
          rows: changesTreeRows(
            changesTree([change('src/a.ts'), change('b.ts')]),
            new Set(closed),
          ),
        },
      ]),
      cursor,
      'one',
    ),
  };
}

suite('Files column', () => {
  test('keeps the cursor where the keys moved it only on the commit and tab it moved on', () => {
    const keys = ['changes', 'folder:src', 'file:src/a.ts'];
    const moved = { key: 'folder:src', from: 'changes', view: 'one' };
    assert.strictEqual(
      filesCursor(moved, 'changes', 'one', keys),
      'folder:src',
    );
    assert.strictEqual(filesCursor(moved, 'changes', 'two', keys), 'changes');
    assert.strictEqual(
      filesCursor(moved, 'file:src/a.ts', 'one', keys),
      'file:src/a.ts',
    );
    assert.strictEqual(
      filesCursor(moved, 'changes', 'one', ['changes']),
      'changes',
    );
    assert.strictEqual(
      filesCursor(undefined, 'changes', 'one', keys),
      'changes',
    );
  });

  test('scrolls to the cursor again once the folder it is on opens or closes, as a folder closed from its pinned row is left above the view', () => {
    const open = revealAt([], 'folder:src');
    const closed = revealAt(['src'], 'folder:src');
    assert.ok(revealAgain(open, closed));
    assert.ok(revealAgain(closed, open));
    assert.ok(!revealAgain(open, revealAt([], 'folder:src')));
    assert.ok(
      !revealAgain(revealAt([], 'file:b.ts'), revealAt(['src'], 'file:b.ts')),
    );
  });
});
