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
  leftAloneInGitDir,
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

class FakeWatcher extends EventEmitter implements FolderWatcher {
  closed = false;

  constructor(readonly listener: (event: string, file: string | null) => void) {
    super();
  }

  close(): void {
    this.closed = true;
  }
}

function heldIgnores() {
  const ignoring = new Set<string>();
  const held = {
    holding: false,
    release: undefined as (() => void) | undefined,
  };
  const ignored = (_repo: string, folders: readonly string[]) => {
    const answer = folders.filter((folder) =>
      ignoring.has(path.basename(folder)),
    );
    if (!held.holding) {
      return Promise.resolve(answer);
    }
    held.holding = false;
    return new Promise<readonly string[]>((resolve) => {
      held.release = () => resolve(answer);
    });
  };
  return { ignoring, held, ignored };
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
      skip: (folder) => ['skipped', '.git'].includes(path.basename(folder)),
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

  test('stops walking the tree once watching it is called off, as walking a large one takes seconds', async () => {
    mkdir('a/b/c');
    const watching = new AbortController();
    const tree = await watchTree(root, {
      skip: () => false,
      ignored: () => Promise.resolve([]),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      signal: watching.signal,
      watch: (folder, listener) => {
        if (path.basename(folder) === 'a') {
          watching.abort();
        }
        return fakeWatch(folder, listener);
      },
    });
    assert.deepStrictEqual(watched(), ['', 'a']);
    await tree.dispose();
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
    mkdir('a/a/deep');
    await start();
    const named = path.basename(root);
    const kept = [root, path.join(root, 'a'), path.join(root, 'a', 'a')].map(
      (folder) => watchers.get(folder),
    );
    fs.writeFileSync(path.join(root, named), '');
    fs.writeFileSync(path.join(root, 'a', 'a', 'a'), '');
    mkdir('later');
    watchers.get(root)?.listener('rename', named);
    watchers.get(path.join(root, 'a', 'a'))?.listener('rename', 'a');
    watchers.get(root)?.listener('rename', 'later');
    await waitFor(() => watched().includes('later'), 'the new folder');
    assert.deepStrictEqual(watched(), ['', 'a', 'a/a', 'a/a/deep', 'later']);
    assert.deepStrictEqual(
      [root, path.join(root, 'a'), path.join(root, 'a', 'a')].map((folder) =>
        watchers.get(folder),
      ),
      kept,
    );
    assert.ok(kept.every((watcher) => watcher?.closed === false));
  });

  test('watches the root again once it is removed and made anew, as no folder above it is watched to tell of it', async () => {
    mkdir('a');
    await start();
    const before = [root, path.join(root, 'a')].map((folder) =>
      watchers.get(folder),
    );
    fs.rmSync(root, { recursive: true });
    mkdir('a');
    before[0]?.listener('rename', path.basename(root));
    await waitFor(
      () => watchers.get(path.join(root, 'a')) !== before[1],
      'the root made anew',
    );
    assert.ok(before.every((watcher) => watcher?.closed === true));
    assert.deepStrictEqual(watched(), ['', 'a']);
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

  test('stops watching the folders under a .gitignore that it comes to ignore, as each takes one of the inotify watches', async () => {
    mkdir('a/node_modules/x/y', 'a/kept', 'other/node_modules');
    const ignoring = new Set<string>();
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
    const before = watched();
    ignoring.add('node_modules');
    watchers.get(path.join(root, 'a'))?.listener('change', '.gitignore');
    await waitFor(
      () => !watched().includes('a/node_modules'),
      'the folder now ignored',
    );
    assert.deepStrictEqual(
      watched(),
      before.filter((folder) => !folder.startsWith('a/node_modules')),
    );
    ignoring.clear();
    watchers.get(path.join(root, 'a'))?.listener('change', '.gitignore');
    await waitFor(
      () => watched().includes('a/node_modules/x/y'),
      'the folder ignored no more',
    );
    assert.deepStrictEqual(watched(), before);
  });

  test('keeps watching a folder the ignores came to leave alone again while git was asked whether they ignored it', async () => {
    mkdir('a/build', 'a/kept');
    const { ignoring, held, ignored } = heldIgnores();
    await watchTree(root, {
      skip: () => false,
      ignored,
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    const gitignore = watchers.get(path.join(root, 'a'));
    ignoring.add('build');
    held.holding = true;
    gitignore?.listener('change', '.gitignore');
    await waitFor(() => held.release !== undefined, 'git to be asked');
    ignoring.clear();
    gitignore?.listener('change', '.gitignore');
    await new Promise((resolve) => setTimeout(resolve, 20));
    held.release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepStrictEqual(watched(), ['', 'a', 'a/build', 'a/kept']);
  });

  test('watches a folder made while ignored once the ignores leave it alone, even when they change while git is asked about it', async () => {
    mkdir('a');
    const { ignoring, held, ignored } = heldIgnores();
    await watchTree(root, {
      skip: () => false,
      ignored,
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    const parent = watchers.get(path.join(root, 'a'));
    ignoring.add('out');
    held.holding = true;
    mkdir('a/out');
    parent?.listener('rename', 'out');
    await waitFor(() => held.release !== undefined, 'git to be asked');
    ignoring.clear();
    parent?.listener('change', '.gitignore');
    await new Promise((resolve) => setTimeout(resolve, 20));
    held.release?.();
    await waitFor(() => watched().includes('a/out'), 'the folder');
  });

  test('asks git once about the folders under a .gitignore that changes several times at once, as an editor saving it does', async () => {
    mkdir('a/b');
    await start();
    ignoredCalls = [];
    const gitignore = watchers.get(path.join(root, 'a'));
    gitignore?.listener('rename', '.gitignore');
    gitignore?.listener('rename', '.gitignore');
    gitignore?.listener('change', '.gitignore');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepStrictEqual(ignoredCalls, [['', ['a/b']]]);
  });

  test('asks again whether any folder is ignored when told the ignores of the whole repository changed, as for .git/info/exclude', async () => {
    mkdir('a/gen', 'b');
    const ignoring = new Set(['gen']);
    const tree = await watchTree(root, {
      skip: () => false,
      ignored: (_repo, folders) =>
        Promise.resolve(
          folders.filter((folder) => ignoring.has(path.basename(folder))),
        ),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: fakeWatch,
    });
    assert.deepStrictEqual(watched(), ['', 'a', 'b']);
    ignoring.clear();
    ignoring.add('b');
    tree.ignoresChanged(root);
    await waitFor(
      () => watched().includes('a/gen') && !watched().includes('b'),
      'the folders asked again',
    );
    assert.deepStrictEqual(watched(), ['', 'a', 'a/gen']);
  });

  test('stops watching removed folders', async () => {
    mkdir('a/b/c');
    await start();
    fs.rmSync(path.join(root, 'a', 'b'), { recursive: true });
    watchers.get(path.join(root, 'a'))?.listener('rename', 'b');
    await waitFor(() => watched().length === 2, 'the folder to be unwatched');
    assert.deepStrictEqual(watched(), ['', 'a']);
  });

  test('reports the first watch the system refuses, as past fs.inotify.max_user_watches, and keeps watching the rest', async () => {
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

  test('asks a repository made in a watched folder, and none once it is gone, whether the folders made in it and in its subfolders are ignored', async () => {
    mkdir('sub/a');
    await start();
    const tell = async (folder: string) => {
      ignoredCalls = [];
      mkdir(folder);
      watchers
        .get(path.join(root, path.dirname(folder)))
        ?.listener('rename', path.basename(folder));
      await waitFor(() => watched().includes(folder), folder);
      return ignoredCalls;
    };
    mkdir('sub/.git');
    watchers.get(path.join(root, 'sub'))?.listener('rename', '.git');
    assert.deepStrictEqual(await tell('sub/new'), [['sub', ['sub/new']]]);
    assert.deepStrictEqual(await tell('sub/a/new'), [['sub', ['sub/a/new']]]);
    fs.rmSync(path.join(root, 'sub', '.git'), { recursive: true });
    watchers.get(path.join(root, 'sub'))?.listener('rename', '.git');
    assert.deepStrictEqual(await tell('sub/a/other'), [['', ['sub/a/other']]]);
  });

  test('reports the first failure of each kind, so failing to tell ignored folders hides no failed watch', async () => {
    mkdir('repo/.git', 'repo/inner', 'b/c');
    const failure = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    const told = new Error('check-ignore failed');
    await watchTree(root, {
      skip: () => false,
      ignored: (repo) =>
        repo === root ? Promise.resolve([]) : Promise.reject(told),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      watch: (folder, listener) => {
        if (path.basename(folder) === 'c') {
          throw failure;
        }
        return fakeWatch(folder, listener);
      },
    });
    assert.deepStrictEqual(watched(), ['', 'b', 'repo']);
    assert.deepStrictEqual(errors, [told, failure]);
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
