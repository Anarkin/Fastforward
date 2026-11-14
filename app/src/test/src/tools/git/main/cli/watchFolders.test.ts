import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { waitFor } from '../../../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../../../helpers/repositories';
import {
  watchEach,
  watchTree,
  type FolderWatcher,
} from '../../../../../../tools/git/main/cli/watchFolders';
import { watchesRecursively } from '../../../../../../tools/git/main/cli/watch';

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

  beforeEach(() => {
    root = tempFolder('tree');
    watchers = new Map();
    ignoredCalls = [];
    events = [];
    errors = [];
  });

  afterEach(() => removeFolder(root));

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

  test('tells of a folder created later once it and its subfolders are watched, as files written into them before then go untold', async () => {
    mkdir('a');
    await start();
    mkdir('a/new/deep');
    watchers.get(path.join(root, 'a'))?.listener('rename', 'new');
    await waitFor(() => events.length === 2, 'the new folder to be told of');
    assert.deepStrictEqual(watched(), ['', 'a', 'a/new', 'a/new/deep']);
    assert.deepStrictEqual(events, [
      ['a', 'new'],
      ['a', 'new'],
    ]);
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

  test('tells running out of watches and failing to watch the root apart from failing to watch a subfolder or to tell ignored folders, as only the first stop it from refreshing', async () => {
    mkdir('repo/.git', 'repo/inner', 'b', 'c');
    const exhausted = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const forbidden = Object.assign(new Error('EPERM'), { code: 'EPERM' });
    const rootDenied = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const told = new Error('check-ignore failed');
    const stopped: unknown[] = [];
    await watchTree(root, {
      skip: () => false,
      ignored: (repo) =>
        repo === root ? Promise.resolve([]) : Promise.reject(told),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      onStopped: (error) => stopped.push(error),
      watch: (folder, listener) => {
        if (path.basename(folder) === 'b') {
          throw exhausted;
        }
        if (path.basename(folder) === 'c') {
          throw denied;
        }
        return fakeWatch(folder, listener);
      },
    });
    watchers.get(path.join(root, 'repo'))?.emit('error', forbidden);
    watchers.get(root)?.emit('error', rootDenied);
    assert.deepStrictEqual(errors, [denied, told, forbidden]);
    assert.deepStrictEqual(stopped, [exhausted, rootDenied]);
  });

  test('tells failing to watch the root as stopping it from refreshing, whatever the failure', async () => {
    const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const stopped: unknown[] = [];
    await watchTree(root, {
      skip: () => false,
      ignored: () => Promise.resolve([]),
      onEvent: () => {},
      onError: (error) => errors.push(error),
      onStopped: (error) => stopped.push(error),
      watch: () => {
        throw denied;
      },
    });
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(stopped, [denied]);
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
