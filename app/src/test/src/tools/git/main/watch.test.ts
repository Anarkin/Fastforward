import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  affectsWorktree,
  affectsWorktreeList,
  changesRefsAlone,
  gitDirChanged,
  isInternal,
  leftAloneInGitDir,
  nextFlush,
  watchedFolder,
} from '../../../../../tools/git/main/watch';

suite('Watching the git folder', () => {
  const modules = new Set([
    'modules/sub',
    'modules/sub/modules/inner',
    'modules/sub/modules/vendor/lfs',
    'modules/nested/sub',
    'modules/vendor/lfs',
    'modules/vendor/logs',
    'modules/vendor/objects',
    'modules/deps/logs/parser',
    'modules/deps/objects/parser',
    'modules/deps/lfs/x',
  ]);
  const isModule = (inGitDir: string) =>
    modules.has(inGitDir.split(/[\\/]/).join('/'));

  test('watches the folders of a git folder inside the working tree that it refreshes for, but none in the git folder of the repository itself', () => {
    const root = path.resolve('repo');
    const leftAlone = (folder: string) =>
      leftAloneInGitDir(
        root,
        path.join(root, ...folder.split('/')),
        () => () => false,
      );
    assert.deepStrictEqual(
      [
        '.git',
        '.git/refs',
        'lib',
        'lib/.git',
        'lib/.git/refs/heads',
        'lib/.git/objects',
        'lib/.git/objects/pack',
        'lib/.git/logs/refs',
        'a/b/.git/lfs',
      ].filter(leftAlone),
      [
        '.git',
        '.git/refs',
        'lib/.git/objects',
        'lib/.git/objects/pack',
        'a/b/.git/lfs',
      ],
    );
  });

  test('refreshes for HEAD, the index and refs', () => {
    for (const file of [
      'HEAD',
      'index',
      'packed-refs',
      'refs/heads/main',
      'refs\\remotes\\origin\\main',
      'modules/sub/HEAD',
      'modules/nested/sub/refs/heads/main',
      'modules/sub/refs/heads/logs',
    ]) {
      assert.strictEqual(isInternal(file, isModule), false, file);
    }
  });

  test('refreshes for the stashes, which dropping all but the newest changes only in their reflog', () => {
    for (const file of ['refs/stash', 'logs/refs/stash', 'logs\\refs\\stash']) {
      assert.strictEqual(isInternal(file, isModule), false, file);
      assert.strictEqual(affectsWorktree(file, true, isModule), true, file);
    }
    for (const file of ['logs/refs/stash.lock', 'logs/refs/heads/main']) {
      assert.strictEqual(isInternal(file, isModule), true, file);
    }
  });

  test('watches the folders of the git folder it refreshes for, and those on the way to the reflog of the stashes', () => {
    for (const folder of ['refs', 'refs/heads', 'logs', 'logs\\refs']) {
      assert.strictEqual(watchedFolder(folder, true, isModule), true, folder);
    }
    for (const folder of ['objects', 'logs/refs/heads', 'refs/bisect']) {
      assert.strictEqual(watchedFolder(folder, true, isModule), false, folder);
    }
    assert.strictEqual(watchedFolder('worktrees/other', false, isModule), true);
  });

  test("tells a submodule named like the folders it leaves alone by the first git folder on its path, as git puts no submodule's git folder inside another's", () => {
    for (const file of [
      'modules/vendor/lfs',
      'modules/vendor/lfs/HEAD',
      'modules/vendor/lfs/refs/heads/main',
      'modules/vendor/objects/index',
      'modules/vendor/logs/config',
      'modules/vendor/logs/HEAD',
      'modules/vendor/logs/refs/heads/main',
      'modules/sub/modules/vendor/lfs/index',
      'modules/deps/logs/parser/index',
      'modules\\deps\\logs\\parser\\HEAD',
      'modules/deps/objects/parser/refs/heads/main',
      'modules/deps/lfs/x/index',
    ]) {
      assert.strictEqual(isInternal(file, isModule), false, file);
    }
    for (const file of [
      'modules/vendor/lfs/objects/ab/cd',
      'modules/vendor/logs/logs/HEAD',
      'modules/deps/logs/parser/logs/refs/heads/main',
      'modules/deps/objects/parser/objects/ab/cd',
    ]) {
      assert.strictEqual(isInternal(file, isModule), true, file);
    }
  });

  test('watches the folders on the way to a submodule named like the folders it leaves alone', () => {
    for (const folder of [
      'modules/deps',
      'modules/deps/logs',
      'modules/deps/logs/parser',
      'modules/deps/logs/parser/refs',
    ]) {
      assert.strictEqual(watchedFolder(folder, false, isModule), true, folder);
    }
    for (const folder of [
      'modules/sub/objects',
      'modules/sub/logs',
      'modules/deps/logs/parser/objects',
    ]) {
      assert.strictEqual(watchedFolder(folder, false, isModule), false, folder);
    }
  });

  test('leaves objects, logs and locks alone', () => {
    for (const file of [
      '',
      'objects/ab/cdef',
      'objects\\pack\\pack-1.pack',
      'logs/HEAD',
      'index.lock',
      'refs/heads/main.lock',
      'modules/sub/objects/ab/cdef',
      'modules\\nested\\sub\\logs\\HEAD',
      'modules/sub/modules/inner/objects/pack',
      'lfs/objects/ab/cd/abcdef',
      'lfs/tmp/download',
    ]) {
      assert.strictEqual(isInternal(file, isModule), true, file);
    }
  });

  test('leaves alone FETCH_HEAD, which every fetch writes though it brings nothing, as the app records its fetches itself', () => {
    for (const file of ['FETCH_HEAD', 'modules/sub/FETCH_HEAD']) {
      assert.strictEqual(isInternal(file, isModule), true, file);
    }
  });

  test('leaves alone the files of the fsmonitor daemon, which makes and removes a cookie on every git command a refresh runs', () => {
    for (const file of [
      'fsmonitor--daemon',
      'fsmonitor--daemon/cookies',
      'fsmonitor--daemon\\cookies\\11208-0',
      'fsmonitor--daemon.ipc',
      'modules/sub/fsmonitor--daemon',
      'modules/sub/fsmonitor--daemon/cookies',
      'modules/sub/fsmonitor--daemon/cookies/11208-0',
    ]) {
      assert.strictEqual(affectsWorktree(file, false, isModule), false, file);
    }
    assert.strictEqual(
      watchedFolder('fsmonitor--daemon', false, isModule),
      false,
    );
  });

  test('leaves the files of other worktrees alone', () => {
    for (const file of [
      'worktrees/feature/index',
      'worktrees\\feature\\HEAD',
    ]) {
      assert.strictEqual(affectsWorktree(file, false, isModule), false, file);
      assert.strictEqual(affectsWorktree(file, true, isModule), false, file);
    }
    for (const file of [
      'index',
      'HEAD',
      'ORIG_HEAD',
      'refs/bisect/bad',
      'refs/worktree/x',
      'logs/HEAD',
    ]) {
      assert.strictEqual(affectsWorktree(file, true, isModule), false, file);
    }
  });

  test('lists the worktrees again for a HEAD, or a worktree added or removed', () => {
    for (const file of [
      'HEAD',
      'worktrees',
      'worktrees/feature',
      'worktrees\\feature\\HEAD',
      'worktrees/feature/gitdir',
    ]) {
      assert.strictEqual(affectsWorktreeList(file), true, file);
    }
    for (const file of [
      'ORIG_HEAD',
      'HEAD.lock',
      'refs/heads/main',
      'worktrees/feature/index',
      'worktrees/feature/HEAD.lock',
      'worktrees/feature/logs/HEAD',
      'worktrees/feature/refs/bisect/bad',
    ]) {
      assert.strictEqual(affectsWorktreeList(file), false, file);
    }
  });

  test('lists the worktrees again for a table of refs written, which holds HEAD, and the folders on the way to it, under the reftable ref format', () => {
    for (const file of [
      'reftable/tables.list',
      'worktrees/feature/reftable',
      'worktrees\\feature\\reftable\\tables.list',
    ]) {
      assert.strictEqual(affectsWorktreeList(file), true, file);
      assert.strictEqual(watchedFolder(file, false, isModule), true, file);
    }
    for (const file of [
      'reftable/tables.list.lock',
      'reftable/0x000000000002-0x000000000002-1a2b3c4d.ref',
      'worktrees/feature/reftable/tables.list.lock',
      'worktrees/feature/reftable/0x000000000002-0x000000000002-1a2b3c4d.ref',
    ]) {
      assert.strictEqual(affectsWorktreeList(file), false, file);
    }
  });

  test('refreshes a linked worktree for the refs it shares', () => {
    for (const file of [
      'refs/heads/main',
      'refs\\tags\\v1',
      'packed-refs',
      'reftable/tables.list',
      'reftable\\0x000000000002-0x000000000002-1a2b3c4d.ref',
      'config',
    ]) {
      assert.strictEqual(affectsWorktree(file, true, isModule), true, file);
    }
    for (const file of [
      'index',
      'HEAD',
      'refs/heads/main',
      'refs/bisect/bad',
    ]) {
      assert.strictEqual(affectsWorktree(file, false, isModule), true, file);
    }
  });

  test('refreshes a linked worktree for the excludes and attributes it shares, which change what it ignores and how it diffs, watching the folder they are in', () => {
    for (const file of ['info/exclude', 'info\\attributes']) {
      assert.strictEqual(affectsWorktree(file, true, isModule), true, file);
    }
    assert.strictEqual(watchedFolder('info', true, isModule), true);
  });

  test('refreshes a linked worktree for the shallow file it shares, which deepening a shallow clone rewrites', () => {
    assert.strictEqual(affectsWorktree('shallow', true, isModule), true);
    assert.strictEqual(affectsWorktree('shallow.lock', true, isModule), false);
  });

  test('refreshes refs alone for remote branches and tags, which a fetch writes and which leave the working tree as it was', () => {
    for (const file of [
      'refs/remotes/origin/main',
      'refs\\remotes\\origin\\feature\\x',
      'refs/tags/v1',
      'refs/tags/release/v1',
    ]) {
      assert.strictEqual(changesRefsAlone(file), true, file);
    }
    for (const file of [
      'HEAD',
      'index',
      'packed-refs',
      'config',
      'refs/heads/main',
      'refs/stash',
      'logs/refs/stash',
      'refs/remotes',
      'refs/tags',
      'reftable/tables.list',
      'modules/sub/refs/remotes/origin/main',
    ]) {
      assert.strictEqual(changesRefsAlone(file), false, file);
    }
  });
});

suite('Debouncing changes', () => {
  test('waits the delay after the last change', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 0 }, 300, 1500),
      { at: 300, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1000 }, 300, 1500),
      { at: 1300, gitDir: false },
    );
  });

  test('flushes work tree changes at most the longest wait after the first one, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1400 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 2000 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
  });

  test('waits for the git folder to stop changing, as a long rebase keeps writing it', () => {
    assert.deepStrictEqual(nextFlush({ lastGitDir: 10_000 }, 300, 1500), {
      at: 10_300,
      gitDir: true,
    });
  });

  test('flushes the work tree alone while the git folder keeps changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1400, lastGitDir: 1400 },
        300,
        1500,
      ),
      { at: 1500, gitDir: false },
    );
  });

  test('flushes a quiet git folder with the work tree, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1000, lastGitDir: 100 },
        300,
        1500,
      ),
      { at: 400, gitDir: true },
    );
  });

  test('refreshes refs alone only while every change to the git folder since the last flush changed refs alone', () => {
    const remote = gitDirChanged({}, 100, true);
    assert.deepStrictEqual(remote, { lastGitDir: 100, refsAlone: true });
    assert.deepStrictEqual(gitDirChanged(remote, 200, true), {
      lastGitDir: 200,
      refsAlone: true,
    });
    const index = gitDirChanged(remote, 200, false);
    assert.deepStrictEqual(index, { lastGitDir: 200, refsAlone: false });
    assert.deepStrictEqual(gitDirChanged(index, 300, true), {
      lastGitDir: 300,
      refsAlone: false,
    });
    assert.deepStrictEqual(
      gitDirChanged({ firstWorkTree: 0, lastWorkTree: 50 }, 100, true),
      { firstWorkTree: 0, lastWorkTree: 50, lastGitDir: 100, refsAlone: true },
    );
  });

  test('waits longer after the git folder changes than after files do, as an editor writes a file at once while git keeps writing its folder', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 0 }, 100, 1500, 300),
      { at: 100, gitDir: false },
    );
    assert.deepStrictEqual(nextFlush({ lastGitDir: 0 }, 100, 1500, 300), {
      at: 300,
      gitDir: true,
    });
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 0, lastGitDir: 0 },
        100,
        1500,
        300,
      ),
      { at: 100, gitDir: false },
    );
  });

  test('has nothing to flush without changes', () => {
    assert.strictEqual(nextFlush({}, 300, 1500), undefined);
  });
});
