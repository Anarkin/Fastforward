import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  affectsWorktree,
  isInternal,
  nextFlush,
  watchTree,
  type FolderWatcher,
} from '../git/watch';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

suite('Watching the git folder', () => {
  test('refreshes for HEAD, the index and refs', () => {
    for (const file of [
      'HEAD',
      'index',
      'packed-refs',
      'FETCH_HEAD',
      'refs/heads/main',
      'refs\\remotes\\origin\\main',
      'modules/sub/HEAD',
      'modules/nested/sub/refs/heads/main',
    ]) {
      assert.strictEqual(isInternal(file), false, file);
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
      assert.strictEqual(isInternal(file), true, file);
    }
  });

  test('leaves the files of other worktrees alone', () => {
    for (const file of [
      'worktrees/feature/index',
      'worktrees\\feature\\HEAD',
    ]) {
      assert.strictEqual(affectsWorktree(file, false), false, file);
      assert.strictEqual(affectsWorktree(file, true), false, file);
    }
    for (const file of [
      'index',
      'HEAD',
      'ORIG_HEAD',
      'refs/bisect/bad',
      'refs/worktree/x',
      'logs/HEAD',
    ]) {
      assert.strictEqual(affectsWorktree(file, true), false, file);
    }
  });

  test('refreshes a linked worktree for the refs it shares', () => {
    for (const file of [
      'refs/heads/main',
      'refs\\tags\\v1',
      'packed-refs',
      'config',
    ]) {
      assert.strictEqual(affectsWorktree(file, true), true, file);
    }
    for (const file of [
      'index',
      'HEAD',
      'refs/heads/main',
      'refs/bisect/bad',
    ]) {
      assert.strictEqual(affectsWorktree(file, false), true, file);
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
    tree.dispose();
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
