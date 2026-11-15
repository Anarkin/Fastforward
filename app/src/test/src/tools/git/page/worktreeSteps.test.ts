import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { adjacentWorktree } from '../../../../../tools/git/page/worktreeSteps';

suite('Worktree steps', () => {
  test('skips the worktrees whose folder is missing', () => {
    const worktrees = [
      { root: '/a', name: 'main', folder: 'a', main: true, missing: false },
      { root: '/b', name: 'gone', folder: 'b', main: false, missing: true },
      { root: '/c', name: 'feature', folder: 'c', main: false, missing: false },
    ];
    assert.strictEqual(adjacentWorktree(worktrees, '/a', 1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/a', -1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/b', 1), '/c');
    assert.strictEqual(
      adjacentWorktree(worktrees.slice(0, 2), '/a', 1),
      undefined,
    );
  });
});
