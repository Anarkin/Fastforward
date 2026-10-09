import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  affectsWorktree,
  affectsWorktreeList,
  changesRefsAlone,
  gitDirChanged,
  isInternal,
  nextFlush,
  watchEach,
  watchedFolder,
  watchesRecursively,
  watchTree,
  type FolderWatcher,
} from '../../git/watch';
import { waitFor } from '../fixtures';
import { removeFolder, tempFolder } from '../repositories';

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

  test('tells a submodule named like the folders it leaves alone by where its git folder is', () => {
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

  test('has nothing to flush without changes', () => {
    assert.strictEqual(nextFlush({}, 300, 1500), undefined);
  });
});

class FakeWatcher extends EventEmitter implements FolderWatcher {
  closed = false;

  constructor(readonly listener: (event: string, file: string | null) => void) {
    super();
  }

  close(): void {
    this.closed = true;
  }
}

suite('Watching folders one by one', () => {
  let root: string;
  let watchers: Map<string, FakeWatcher>;
  let ignoredCalls: [string, string[]][];
  let events: [string, string | null][];
  let errors: unknown[];

  const relative = (folder: string) =>
    path.relative(root, folder).split(path.sep).join('/');
  const watched = () =>
    [...watchers]
      .filter(([, watcher]) => !watcher.closed)
      .map(([folder]) => relative(folder))
      .toSorted();
  const mkdir = (...folders: string[]) => {
    for (const folder of folders) {
      fs.mkdirSync(path.join(root, folder), { recursive: true });
    }
  };
  const fakeWatch = (
    folder: string,
    listener: (event: string, file: string | null) => void,
  ) => {
    const watcher = new FakeWatcher(listener);
    watchers.set(folder, watcher);
    return watcher;
  };
  const start = (before: (folder: string) => void = () => {}) =>
    watchTree(root, {
      skip: (folder) => path.basename(folder) === 'skipped',
      ignored: (repo, folders) => {
        ignoredCalls.push([relative(repo), folders.map(relative).toSorted()]);
        return Promise.resolve(
          folders.filter((folder) => path.basename(folder) === 'ignored'),
        );
      },
      onEvent: (folder, file) => events.push([relative(folder), file]),
      onError: (error) => errors.push(error),
      watch: (folder, listener) => {
        before(folder);
        return fakeWatch(folder, listener);
      },
    });

  setup(() => {
    root = tempFolder('tree');
    watchers = new Map();
    ignoredCalls = [];
    events = [];
    errors = [];
  });

  teardown(() => removeFolder(root));

  test('watches every folder but skipped and ignored ones and their subfolders', async () => {
    mkdir('a/b', 'a/skipped/c', 'ignored/d', 'e');
    fs.writeFileSync(path.join(root, 'a', 'file'), '');
    const tree = await start();
    assert.deepStrictEqual(watched(), ['', 'a', 'a/b', 'e']);
    await tree.dispose();
    assert.deepStrictEqual(watched(), []);
  });

  test('stops watching a folder named like a parent folder when disposed', async () => {
    mkdir('..cache/deep');
    const tree = await start();
    assert.deepStrictEqual(watched(), ['', '..cache', '..cache/deep']);
    await tree.dispose();
    assert.deepStrictEqual(watched(), []);
  });

  test('leaves git folders alone and asks a nested repository whether its folders are ignored', async () => {
    mkdir('.git/refs', 'sub/.git', 'sub/inner', 'sub/ignored');
    await start();
    assert.deepStrictEqual(watched(), ['', 'sub', 'sub/inner']);
    assert.deepStrictEqual(ignoredCalls, [
      ['', ['sub']],
      ['sub', ['sub/ignored', 'sub/inner']],
    ]);
  });

  test('passes events on', async () => {
    mkdir('a');
    await start();
    watchers.get(path.join(root, 'a'))?.listener('change', 'file');
    watchers.get(root)?.listener('change', null);
    assert.deepStrictEqual(events, [
      ['a', 'file'],
      ['', null],
    ]);
  });

  test('watches folders created later, with their subfolders', async () => {
    mkdir('a');
    await start();
    mkdir('a/new/deep', 'a/new/ignored');
    watchers.get(path.join(root, 'a'))?.listener('rename', 'new');
    await waitFor(() => watched().includes('a/new/deep'), 'the new folder');
    assert.deepStrictEqual(watched(), ['', 'a', 'a/new', 'a/new/deep']);
  });

  test('asks once whether the folders created at once are ignored, as asking git costs a process', async () => {
    mkdir('a');
    await start();
    ignoredCalls = [];
    mkdir('a/x', 'a/y', 'a/z');
    for (const name of ['x', 'y', 'z']) {
      watchers.get(path.join(root, 'a'))?.listener('rename', name);
    }
    await waitFor(() => watched().length === 5, 'the new folders');
    assert.deepStrictEqual(ignoredCalls, [['', ['a/x', 'a/y', 'a/z']]]);
  });

  test('stops once done telling whether the folders created later are ignored', async () => {
    mkdir('a');
    let answer: ((ignored: readonly string[]) => void) | undefined;
    const tree = await watchTree(root, {
      skip: () => false,
      ignored: (_repo, folders) =>
        folders.some((folder) => path.basename(folder) === 'new')
          ? new Promise((resolve) => {
              answer = resolve;
            })
          : Promise.resolve([]),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    mkdir('a/new');
    watchers.get(path.join(root, 'a'))?.listener('rename', 'new');
    await waitFor(() => answer !== undefined, 'the new folder to be checked');
    let done = false;
    const stopping = tree.dispose().then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(done, false);
    answer?.([]);
    await stopping;
    assert.deepStrictEqual(watched(), []);
    assert.deepStrictEqual(errors, []);
  });

  test('keeps watching a folder it already watches when told of it again', async () => {
    mkdir('a/b');
    await start();
    ignoredCalls = [];
    const watcher = watchers.get(path.join(root, 'a', 'b'));
    mkdir('a/c');
    watchers.get(path.join(root, 'a'))?.listener('rename', 'b');
    watchers.get(path.join(root, 'a'))?.listener('rename', 'c');
    await waitFor(() => watched().includes('a/c'), 'the new folder');
    assert.strictEqual(watchers.get(path.join(root, 'a', 'b')), watcher);
    assert.strictEqual(watcher?.closed, false);
    assert.deepStrictEqual(ignoredCalls, [['', ['a/c']]]);
  });

  test('watches a folder removed and created again anew, even when told of its removal last', async () => {
    mkdir('a/b');
    await start();
    const watcher = watchers.get(path.join(root, 'a', 'b'));
    fs.rmSync(path.join(root, 'a', 'b'), { recursive: true });
    mkdir('a/b', 'a/sibling');
    const parent = watchers.get(path.join(root, 'a'));
    parent?.listener('rename', 'b');
    parent?.listener('rename', 'sibling');
    await waitFor(
      () => watchers.has(path.join(root, 'a', 'sibling')),
      'the parent to handle its renames',
    );
    assert.strictEqual(watchers.get(path.join(root, 'a', 'b')), watcher);
    watcher?.listener('rename', 'b');
    await waitFor(
      () => watchers.get(path.join(root, 'a', 'b')) !== watcher,
      'the folder created anew',
    );
    assert.strictEqual(watcher?.closed, true);
    assert.deepStrictEqual(watched(), ['', 'a', 'a/b', 'a/sibling']);
  });

  test('keeps watching a folder told of an entry named like itself, which is told the way its own removal is', async () => {
    mkdir('a');
    await start();
    const named = path.basename(root);
    fs.writeFileSync(path.join(root, named), '');
    mkdir('later');
    watchers.get(root)?.listener('rename', named);
    watchers.get(root)?.listener('rename', 'later');
    await waitFor(() => watched().includes('later'), 'the new folder');
    assert.deepStrictEqual(watched(), ['', 'a', 'later']);
  });

  test('asks again whether the folders under a .gitignore are ignored once it changes', async () => {
    mkdir('a/build/deep', 'a/kept', 'other/build');
    const ignoring = new Set(['build']);
    await watchTree(root, {
      skip: () => false,
      ignored: (_repo, folders) =>
        Promise.resolve(
          folders.filter((folder) => ignoring.has(path.basename(folder))),
        ),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    assert.deepStrictEqual(watched(), ['', 'a', 'a/kept', 'other']);
    ignoring.clear();
    watchers.get(path.join(root, 'a'))?.listener('change', '.gitignore');
    await waitFor(() => watched().includes('a/build/deep'), 'the folders');
    assert.deepStrictEqual(watched(), [
      '',
      'a',
      'a/build',
      'a/build/deep',
      'a/kept',
      'other',
    ]);
  });

  test('stops watching removed folders', async () => {
    mkdir('a/b/c');
    await start();
    fs.rmSync(path.join(root, 'a', 'b'), { recursive: true });
    watchers.get(path.join(root, 'a'))?.listener('rename', 'b');
    await waitFor(() => watched().length === 2, 'the folder to be unwatched');
    assert.deepStrictEqual(watched(), ['', 'a']);
  });

  test('reports the first failed watch and keeps watching the rest', async () => {
    mkdir('a', 'b', 'c');
    const failure = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    await start((folder) => {
      if (folder !== root && path.basename(folder) !== 'c') {
        throw failure;
      }
    });
    assert.deepStrictEqual(watched(), ['', 'c']);
    assert.deepStrictEqual(errors, [failure]);
  });

  test('leaves alone folders removed before they are watched', async () => {
    mkdir('a');
    await start((folder) => {
      if (folder !== root) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
    });
    assert.deepStrictEqual(watched(), ['']);
    assert.deepStrictEqual(errors, []);
  });

  test('reports errors of a watcher', async () => {
    await start();
    const failure = new Error('failed');
    watchers.get(root)?.emit('error', failure);
    assert.deepStrictEqual(errors, [failure]);
  });

  test('reports a failure to tell ignored folders', async () => {
    mkdir('a');
    const failure = new Error('check-ignore failed');
    await watchTree(root, {
      skip: () => false,
      ignored: () => Promise.reject(failure),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    assert.deepStrictEqual(watched(), ['']);
    assert.deepStrictEqual(errors, [failure]);
  });
});

suite('Watching folders recursively', () => {
  test('watches recursively but on Linux, where Node walks the whole tree synchronously with one inotify watch per file', () => {
    assert.strictEqual(watchesRecursively('win32'), true);
    assert.strictEqual(watchesRecursively('darwin'), true);
    assert.strictEqual(watchesRecursively('linux'), false);
  });

  test('closes the folders it watched when watching a later one fails', () => {
    const watched: FakeWatcher[] = [];
    assert.throws(
      () =>
        watchEach(['root', 'git dir'], (folder) => {
          if (folder === 'git dir') {
            throw new Error('EMFILE');
          }
          const watcher = new FakeWatcher(() => undefined);
          watched.push(watcher);
          return watcher;
        }),
      /EMFILE/,
    );
    assert.deepStrictEqual(
      watched.map((watcher) => watcher.closed),
      [true],
    );
  });
});
