import * as assert from 'node:assert';
import * as path from 'node:path';
import { parseWorktrees } from '../../git/worktrees';

const head = 'a'.repeat(40);

suite('Worktrees', () => {
  test('reads the branch, keeping its slashes, or the detached HEAD of each worktree', () => {
    const output = [
      'worktree C:/repo',
      `HEAD ${head}`,
      'branch refs/heads/main',
      '',
      'worktree C:/repo.worktrees/feature',
      `HEAD ${head}`,
      'branch refs/heads/feature/x',
      '',
      'worktree C:/repo.worktrees/review',
      `HEAD ${head}`,
      'detached',
      '',
      '',
    ].join('\0');
    assert.deepStrictEqual(parseWorktrees(output), [
      {
        path: path.resolve('C:/repo'),
        head,
        branch: 'main',
        bare: false,
        missing: false,
      },
      {
        path: path.resolve('C:/repo.worktrees/feature'),
        head,
        branch: 'feature/x',
        bare: false,
        missing: false,
      },
      {
        path: path.resolve('C:/repo.worktrees/review'),
        head,
        branch: undefined,
        bare: false,
        missing: false,
      },
    ]);
  });

  test('reads a bare repository, a branch without commits, and a worktree git can prune', () => {
    const output = [
      'worktree /repo/.bare',
      'bare',
      '',
      'worktree /repo/new',
      `HEAD ${'0'.repeat(40)}`,
      'branch refs/heads/new',
      '',
      'worktree /repo/gone',
      `HEAD ${head}`,
      'detached',
      'prunable gitdir file points to non-existent location',
      '',
      '',
    ].join('\0');
    assert.deepStrictEqual(
      parseWorktrees(output).map(({ head: commit, bare, missing }) => ({
        commit,
        bare,
        missing,
      })),
      [
        { commit: undefined, bare: true, missing: false },
        { commit: undefined, bare: false, missing: false },
        { commit: head, bare: false, missing: true },
      ],
    );
  });

  test('keeps a path with spaces and newlines whole', () => {
    const [worktree] = parseWorktrees(
      ['worktree /a b/c\nd', `HEAD ${head}`, 'detached', '', ''].join('\0'),
    );
    assert.strictEqual(worktree.path, path.resolve('/a b/c\nd'));
  });
});
