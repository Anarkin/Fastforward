import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../builtins';
import {
  ignoredPaths,
  watchRepository,
  type Changed,
} from '../../../../../tools/git/main/cli/watch';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import {
  askingGit,
  changes,
  errors,
  keepWriting,
  repository,
  settled,
  startWatching,
  untilQuiet,
  watchingRepositories,
  worktreeInBareRepository,
} from './watchFixtures';

const start = async (git = askingGit()) => {
  await startWatching({
    delay: 50,
    maxDelay: 200,
    recursive: false,
    onChange: ({ refs }) => changes.push(refs),
    onError: (error) => errors.push(error),
    ignored: git.ignored,
  });
};

suite('Watching a repository', () => {
  watchingRepositories();

  test('refreshes for a file in a folder created after it started, watching folder by folder, in whichever of the folders made it saw, as macOS loses what happens while it adds a folder to the one stream it watches them all through', async () => {
    await start();
    await settled();
    const made: string[] = [];
    await waitFor(() => {
      const folder = path.join(repository.root, `new-${made.length}`, 'deep');
      fs.mkdirSync(folder, { recursive: true });
      made.push(path.join(folder, 'file.txt'));
      return changes.length > 0;
    }, 'a new folder');
    await settled();
    await keepWriting(made, 'the new file');
    assert.deepStrictEqual(errors, []);
  });

  test("refreshes for a file whose name starts with '..', which is not a parent folder, watching folder by folder", async () => {
    await start();
    await keepWriting('..env', 'the file');
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a file named like pathspec magic, though the file it names is ignored, watching folder by folder', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
    }
    await start();
    await keepWriting(':build', 'the file');
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a file in a folder .git/info/exclude ignored until it changed, watching folder by folder', async () => {
    const exclude = path.join(repository.root, '.git', 'info', 'exclude');
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.writeFileSync(exclude, 'generated/\n');
    fs.mkdirSync(path.join(repository.root, 'generated'));
    await start();
    await settled();
    fs.writeFileSync(exclude, '');
    await waitFor(() => changes.includes(true), 'the exclude file');
    await keepWriting(
      path.join('generated', 'file.txt'),
      'the file excluded no more',
    );
    assert.deepStrictEqual(errors, []);
  });

  test('asks the folders again whether they are ignored when .git/info/exclude changes, but not when the file core.excludesFile names does, watching folder by folder', async () => {
    const folder = tempFolder('excludes');
    const excludes = path.join(folder, 'excludes');
    fs.writeFileSync(excludes, 'generated/\n');
    await repository.git(
      'config',
      'core.excludesFile',
      excludes.replaceAll('\\', '/'),
    );
    fs.mkdirSync(path.join(repository.root, 'generated'));
    const file = path.join(repository.root, 'generated', 'file.txt');
    try {
      await start();
      await settled();
      fs.writeFileSync(excludes, '');
      for (let line = 1; line <= 5; line++) {
        fs.writeFileSync(file, 'line\n'.repeat(line));
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.deepStrictEqual(changes, []);
      const exclude = path.join(repository.root, '.git', 'info', 'exclude');
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.writeFileSync(exclude, '# nothing\n');
      await waitFor(() => changes.includes(true), 'the exclude file');
      await keepWriting(
        path.join('generated', 'file.txt'),
        'the file excluded no more',
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      removeFolder(folder);
    }
  });

  test('checks no file git writes into its objects, watching recursively', async () => {
    const statted: string[] = [];
    const nodeFs = process.getBuiltinModule('node:fs');
    const { statSync } = nodeFs;
    replaceBuiltin(
      nodeFs,
      'statSync',
      (...args: Parameters<typeof statSync>) => {
        statted.push(String(args[0]));
        return statSync(...args);
      },
    );
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      const objects = path.join(repository.root, '.git', 'objects', 'ab');
      fs.mkdirSync(objects, { recursive: true });
      for (let written = 0; written < 20; written++) {
        fs.writeFileSync(path.join(objects, `${written}`), 'object');
        fs.appendFileSync(path.join(objects, `${written}`), 'more');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepStrictEqual(
        statted.filter((file) => file.includes(`${path.sep}objects`)),
        [],
      );
    } finally {
      replaceBuiltin(nodeFs, 'statSync', statSync);
    }
  });

  test('refreshes only the working tree when the watcher of the working tree drops changes, as Windows does while ignored folders churn, but everything when the watcher of the git folder does, watching recursively', async () => {
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    type Listener = (event: string, file: string | null) => void;
    const listeners = new Map<string, Listener>();
    replaceBuiltin(
      nodeFs,
      'watch',
      (folder: string, options: object, listener: Listener): fs.FSWatcher => {
        listeners.set(path.resolve(folder), listener);
        return watch(folder, options, listener);
      },
    );
    const told: Changed[] = [];
    let listed = 0;
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: (change) => told.push(change),
        onWorktreesChange: () => listed++,
        onError: (error) => errors.push(error),
      });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    await untilQuiet(
      () => told.length + listed,
      () => false,
      'the watchers to settle',
    );
    told.length = 0;
    listed = 0;
    listeners.get(path.resolve(repository.root))?.('rename', null);
    await untilQuiet(
      () => told.length + listed,
      () => told.length === 0,
      'the dropped changes of the working tree',
    );
    assert.deepStrictEqual(told, [{ refs: false, workingTree: true }]);
    assert.strictEqual(listed, 0);
    told.length = 0;
    listeners.get(path.resolve(repository.root, '.git'))?.('rename', null);
    await untilQuiet(
      () => told.length + listed,
      () => told.length === 0 || listed === 0,
      'the dropped changes of the git folder',
    );
    assert.deepStrictEqual(told, [{ refs: true, workingTree: true }]);
    assert.strictEqual(listed, 1);
    assert.deepStrictEqual(errors, []);
  });

  test('tells when a folder it watches recursively stops being watched, as when a network share drops, apart from its other failures, watching recursively', async () => {
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    const made: fs.FSWatcher[] = [];
    replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
      const real = watch(...args);
      made.push(real);
      return real;
    });
    const stopped: unknown[] = [];
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        onStopped: (error) => stopped.push(error),
      });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    const failure = Object.assign(new Error('EPERM: operation not permitted'), {
      code: 'EPERM',
    });
    made[0].emit('error', failure);
    assert.deepStrictEqual(stopped, [failure]);
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes once and stops watching the repository once it is removed, as watching folder by folder does, rather than taking the rename Windows then tells for its folder again and again, watching recursively', async (context) => {
    if (process.platform !== 'win32') {
      context.skip();
    }
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    type Listener = (event: string, file: string | null) => void;
    let told = 0;
    replaceBuiltin(
      nodeFs,
      'watch',
      (folder: string, options: object, listener: Listener): fs.FSWatcher =>
        watch(folder, options, (event, file) => {
          told++;
          listener(event, file);
        }),
    );
    const stopped: unknown[] = [];
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        onStopped: (error) => stopped.push(error),
      });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    await settled();
    fs.rmSync(repository.root, { recursive: true, force: true });
    await waitFor(() => changes.length > 0, 'the refresh');
    await untilQuiet(
      () => told,
      () => false,
      'the watchers to go quiet',
    );
    assert.deepStrictEqual([errors, stopped], [[], []]);
  });

  test('tells once when the system refuses to watch folders, as past fs.inotify.max_user_watches, apart from its other failures, watching folder by folder', async () => {
    fs.mkdirSync(path.join(repository.root, 'src'));
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    const failure = Object.assign(
      new Error('ENOSPC: no space left on device'),
      {
        code: 'ENOSPC',
        syscall: 'watch',
      },
    );
    replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
      if (
        args[0] === path.join(repository.root, 'src') ||
        args[0] === path.join(repository.root, '.git', 'refs')
      ) {
        throw failure;
      }
      return watch(...args);
    });
    const stopped: unknown[] = [];
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: false,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        onStopped: (error) => stopped.push(error),
      });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    assert.deepStrictEqual(stopped, [failure]);
    assert.deepStrictEqual(errors, [failure]);
  });

  test('tells when a folder it watches stops being watched, apart from its other failures, watching folder by folder', async () => {
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    const made = new Map<unknown, fs.FSWatcher>();
    replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
      const real = watch(...args);
      made.set(args[0], real);
      return real;
    });
    const stopped: unknown[] = [];
    try {
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive: false,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        onStopped: (error) => stopped.push(error),
      });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    const failure = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    made.get(repository.root)?.emit('error', failure);
    assert.deepStrictEqual(stopped, [failure]);
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a change in the git folder to an entry it cannot tell is a folder, as when it is denied access, rather than throwing out of the watcher, the git folder written to far enough apart to go quiet, as the watcher waits for, watching recursively', async () => {
    const nodeFs = process.getBuiltinModule('node:fs');
    const { statSync } = nodeFs;
    const delay = 50;
    await startWatching({
      delay,
      maxDelay: 200,
      recursive: true,
      onChange: ({ refs }) => changes.push(refs),
      onError: (error) => errors.push(error),
    });
    await settled();
    replaceBuiltin(nodeFs, 'statSync', () => {
      throw Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      });
    });
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    const listeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', onUncaught);
    try {
      await keepWriting(
        '.git/description',
        'the change to refresh',
        () => changes.includes(true),
        10 * delay,
      );
    } finally {
      replaceBuiltin(nodeFs, 'statSync', statSync);
      process.removeListener('uncaughtException', onUncaught);
      for (const listener of listeners) {
        process.on('uncaughtException', listener);
      }
    }
    assert.deepStrictEqual(uncaught, []);
  });

  test('refreshes for the git folder, watching folder by folder', async () => {
    await start();
    let commits = 0;
    await waitFor(async () => {
      await repository.git('commit', '--allow-empty', '-m', `${commits++}`);
      return changes.includes(true);
    }, 'a commit');
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a file in a folder made in a submodule set up after it started, which its superproject refuses to tell ignored folders in, watching folder by folder', async () => {
    const library = await tempRepository(path.join(repository.root, 'sub'));
    await library.commit('library', { 'lib.c': '' });
    await repository.git('add', '--no-warn-embedded-repo', 'sub');
    const store = tempFolder('module');
    const moduleDir = path.join(store, '.git');
    fs.renameSync(path.join(library.root, '.git'), moduleDir);
    fs.rmSync(path.join(library.root, 'lib.c'));
    const git = askingGit();
    const made = path.join(library.root, 'src');
    try {
      await start(git);
      await settled(git.busy);
      fs.renameSync(moduleDir, path.join(library.root, '.git'));
      await waitFor(() => {
        if (git.asked.includes(made)) {
          return true;
        }
        fs.rmSync(made, { recursive: true, force: true });
        fs.mkdirSync(made);
        return false;
      }, 'the folder made in the submodule to be checked');
      await settled(git.busy);
      await keepWriting(
        path.join('sub', 'src', 'file.txt'),
        'the file in the folder made in the submodule',
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      removeFolder(store);
    }
  });

  test('stays quiet when stopped while telling whether the changed files are ignored, and stops once told, watching folder by folder', async () => {
    const answers: ((ignored: readonly string[]) => void)[] = [];
    let disposing = false;
    const quiet: boolean[] = [];
    const stopped = await watchRepository(repository.gitPath, repository.root, {
      delay: 0,
      maxDelay: 0,
      recursive: false,
      onChange: ({ refs }) => {
        if (disposing) {
          quiet.push(refs);
        }
      },
      onError: (error) => errors.push(error),
      ignored: (_repo, paths) => {
        if (!paths.some((file) => path.basename(file) === 'file.txt')) {
          return Promise.resolve([]);
        }
        return new Promise((resolve) => {
          answers.push(resolve);
        });
      },
    });
    await keepWriting(
      'file.txt',
      'the changed file to be checked',
      () => answers.length > 0,
    );
    let done = false;
    disposing = true;
    const stopping = stopped.dispose().then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(done, false);
    for (const answer of answers) {
      answer([]);
    }
    await stopping;
    assert.deepStrictEqual(quiet, []);
    assert.deepStrictEqual(errors, []);
  });

  test('stays quiet for a change to an ignored file, watching recursively', async () => {
    fs.mkdirSync(path.join(repository.root, 'build'));
    const built = path.join(repository.root, 'build', 'out.txt');
    const checked: string[] = [];
    const seen: boolean[] = [];
    const watching = await watchRepository(
      repository.gitPath,
      repository.root,
      {
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
        ignored: async (repo, paths) => {
          const found = await ignoredPaths(repository.gitPath, repo, paths);
          checked.push(...paths);
          return found;
        },
      },
    );
    try {
      await keepWriting(built, 'the ignored file to be checked', () =>
        checked.includes(built),
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(!seen.includes(false));
      fs.writeFileSync(path.join(repository.root, 'seen.txt'), 'seen\n');
      await waitFor(() => seen.includes(false), 'a file that is not ignored');
      assert.deepStrictEqual(errors, []);
    } finally {
      await watching.dispose();
    }
  });

  test('asks git no more whether a file saved again and again is ignored once told, until a .gitignore changes, watching recursively', async () => {
    const file = path.join(repository.root, 'file.txt');
    const gitignore = path.join(repository.root, '.gitignore');
    const git = askingGit();
    const { asked, answered } = git;
    const seen: boolean[] = [];
    const answersBeforeTold: number[] = [];
    const watching = await watchRepository(
      repository.gitPath,
      repository.root,
      {
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => {
          seen.push(refs);
          answersBeforeTold.push(answered.length);
        },
        onError: (error) => errors.push(error),
        ignored: git.ignored,
      },
    );
    const saved = async (what: string) => {
      seen.length = 0;
      await keepWriting(file, what, () => seen.includes(false));
    };
    try {
      await saved('the first save');
      assert.ok(asked.includes(file));
      asked.length = 0;
      await saved('the second save');
      await saved('the third save');
      assert.ok(!asked.includes(file));
      answered.length = 0;
      answersBeforeTold.length = 0;
      fs.writeFileSync(gitignore, 'ignored/\n/build\n/file.txt\n');
      await waitFor(() => {
        const answer = answered.indexOf(gitignore);
        return answer !== -1 && answersBeforeTold.some((told) => told > answer);
      }, 'the .gitignore');
      await untilQuiet(
        () => seen.length,
        git.busy,
        'the .gitignore to be told',
      );
      asked.length = 0;
      seen.length = 0;
      await keepWriting(file, 'the file now ignored', () =>
        asked.includes(file),
      );
      await untilQuiet(
        () => seen.length,
        git.busy,
        'the file now ignored to be told',
      );
      assert.ok(!seen.includes(false), 'the file now ignored');
      assert.deepStrictEqual(errors, []);
    } finally {
      await watching.dispose();
    }
  });

  test('asks git again each time an ignored file changes, so one that comes to stop being ignored without a .gitignore changing, as through core.excludesFile, refreshes, watching recursively', async () => {
    const file = path.join(repository.root, 'file.txt');
    const asked: string[] = [];
    const seen: boolean[] = [];
    let ignoring = true;
    const watching = await watchRepository(
      repository.gitPath,
      repository.root,
      {
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
        ignored: (_repo, paths) => {
          asked.push(...paths);
          return Promise.resolve(
            ignoring ? paths.filter((asking) => asking === file) : [],
          );
        },
      },
    );
    try {
      await keepWriting(file, 'the ignored file', () => asked.includes(file));
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!seen.includes(false), 'the ignored file');
      ignoring = false;
      await keepWriting(file, 'the file no longer ignored', () =>
        seen.includes(false),
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      await watching.dispose();
    }
  });

  test('refreshes for a changed file when telling whether it is ignored fails, watching recursively', async () => {
    const file = path.join(repository.root, 'file.txt');
    const seen: boolean[] = [];
    const watching = await watchRepository(
      repository.gitPath,
      repository.root,
      {
        delay: 50,
        maxDelay: 200,
        recursive: true,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
        ignored: (_repo, paths) =>
          paths.includes(file)
            ? Promise.reject(new Error('check-ignore failed'))
            : Promise.resolve([]),
      },
    );
    try {
      await keepWriting(file, 'the changed file', () => seen.includes(false));
      assert.deepStrictEqual(errors, []);
    } finally {
      await watching.dispose();
    }
  });

  test("stays quiet for an ignored folder made in a worktree inside its bare repository's folder, watching recursively", async () => {
    const { folder, worktree } = await worktreeInBareRepository();
    const built = path.join(worktree, 'build');
    const git = askingGit();
    const seen: boolean[] = [];
    const watching = await watchRepository(repository.gitPath, worktree, {
      delay: 50,
      maxDelay: 200,
      recursive: true,
      onChange: ({ refs }) => seen.push(refs),
      onError: (error) => errors.push(error),
      ignored: git.ignored,
    });
    try {
      await waitFor(() => {
        if (git.asked.includes(built)) {
          return true;
        }
        fs.rmSync(built, { recursive: true, force: true });
        fs.mkdirSync(built);
        return false;
      }, 'the ignored folder');
      await untilQuiet(
        () => seen.length,
        git.busy,
        'the ignored folder to be told',
      );
      assert.ok(!seen.includes(false), JSON.stringify(git.asked));
      assert.deepStrictEqual(errors, []);
    } finally {
      await watching.dispose();
      removeFolder(folder);
    }
  });

  test('stays quiet for a file changed in a repository inside an ignored folder, though that repository does not ignore it, watching recursively', async () => {
    const vendored = await tempRepository(
      path.join(repository.root, 'ignored', 'vendored'),
    );
    const file = path.join(vendored.root, 'file.txt');
    fs.writeFileSync(file, '');
    const checked: string[] = [];
    await startWatching({
      delay: 50,
      maxDelay: 200,
      recursive: true,
      onChange: ({ refs }) => changes.push(refs),
      onError: (error) => errors.push(error),
      ignored: (repo, paths) => {
        checked.push(...paths);
        return ignoredPaths(repository.gitPath, repo, paths);
      },
    });
    await keepWriting(file, 'the file in the ignored folder', () =>
      checked.includes(file),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(!changes.includes(false), 'the file in the ignored folder');
    assert.deepStrictEqual(errors, []);
  });
});

suite('Telling the ignored paths', () => {
  let ignoring: TempRepository;

  beforeAll(async () => {
    ignoring = await tempRepository(tempFolder('ignored'));
    fs.writeFileSync(
      path.join(ignoring.root, '.gitignore'),
      'ignored/\n/build\n',
    );
    fs.mkdirSync(path.join(ignoring.root, 'ignored'));
  });

  afterAll(() => removeFolder(ignoring.root));

  test('tells the ignored folders', async () => {
    const kept = path.join(ignoring.root, 'kept');
    fs.mkdirSync(kept);
    const ignored = path.join(ignoring.root, 'ignored');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [kept, ignored]),
      [ignored],
    );
  });

  test('tells the ignored folders among ones named like pathspec magic', async () => {
    fs.appendFileSync(path.join(ignoring.root, '.gitignore'), ':!tmp\n');
    const magic = path.join(ignoring.root, ':!tmp');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [
        path.join(ignoring.root, ':-)'),
        magic,
        path.join(ignoring.root, 'ignored'),
      ]),
      [magic, path.join(ignoring.root, 'ignored')],
    );
  });

  test('tells a path named like pathspec magic from the ignored one it names', async () => {
    const build = path.join(ignoring.root, 'build');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [
        path.join(ignoring.root, ':build'),
        build,
      ]),
      [build],
    );
  });
});
