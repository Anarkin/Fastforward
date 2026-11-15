import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  changesTree,
  changesTreeRows,
} from '../../../../../tools/git/page/changesRows';
import { filesRows } from '../../../../../tools/git/page/filesRows';
import {
  filesCursor,
  filesReveal,
  filesTitle,
  listsNothing,
  noChangesText,
} from '../../../../../tools/git/page/filesColumnState';
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

  test('titles itself with the commit shown or the two compared, as the history names them, as Files while none is, and with nothing for the uncommitted changes, which their row atop the history already names', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(filesTitle(undefined), 'Files');
    assert.strictEqual(filesTitle(hash), '0123456');
    assert.strictEqual(filesTitle(workingTreeHash), '');
    assert.strictEqual(
      filesTitle(comparisonOf(hash, workingTreeHash)),
      '0123456 → uncommitted',
    );
  });

  test('says a commit changed nothing, or that the two compared have the same files', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(noChangesText(undefined, undefined), undefined);
    assert.strictEqual(noChangesText(hash, undefined), 'No changes');
    assert.strictEqual(
      noChangesText(comparisonOf(hash, workingTreeHash), undefined),
      'No differences, both have the same files',
    );
  });

  test('says nothing changed only while no error is shown, as files that could not be listed are none', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const error = 'fatal: unable to read tree 1234abcd';
    assert.strictEqual(noChangesText(hash, error), undefined);
    assert.strictEqual(
      noChangesText(comparisonOf(hash, workingTreeHash), error),
      undefined,
    );
  });

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
