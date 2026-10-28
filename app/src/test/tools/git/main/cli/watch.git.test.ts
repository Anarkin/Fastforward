import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../builtins';
import {
  ignoredPaths,
  watchesRecursively,
  watchRepository,
  type Changed,
  type Watcher,
} from '../../../../../tools/git/main/cli/watch';
import { waitFor } from '../../../../fixtures';
import {
  createsAnewThroughJunctions,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';

const untilQuiet = async (
  told: () => number,
  busy: () => boolean,
  what: string,
  quietFor = 300,
) => {
  let last = told();
  let since = Date.now();
  await waitFor(() => {
    if (told() !== last || busy()) {
      last = told();
      since = Date.now();
    }
    return Date.now() - since > quietFor;
  }, what);
};

suite('Watching a repository', () => {
  let repository: TempRepository;
  let watcher: Watcher | undefined;
  let changes: boolean[];
  let errors: unknown[];

  beforeEach(async () => {
    repository = await tempRepository(tempFolder('watch'));
    fs.writeFileSync(
      path.join(repository.root, '.gitignore'),
      'ignored/\n/build\n',
    );
    fs.mkdirSync(path.join(repository.root, 'ignored'));
    await repository.git('add', '.gitignore');
    await repository.git('commit', '-m', 'first');
    changes = [];
    errors = [];
  });

  beforeEach((context) => {
    if (
      !watchesRecursively() &&
      context.task.name.endsWith('watching recursively')
    ) {
      context.skip();
    }
  });

  afterEach(async () => {
    await watcher?.dispose();
    watcher = undefined;
    removeFolder(repository.root);
  });

  const askingGit = () => {
    const asked: string[] = [];
    const answered: string[] = [];
    let asking = 0;
    return {
      asked,
      answered,
      busy: () => asking > 0,
      ignored: async (repo: string, paths: readonly string[]) => {
        asked.push(...paths);
        asking++;
        try {
          return await ignoredPaths(repository.gitPath, repo, paths);
        } finally {
          asking--;
          answered.push(...paths);
        }
      },
    };
  };

  const start = async (git = askingGit()) => {
    watcher = await watchRepository(repository.gitPath, repository.root, {
      delay: 50,
      maxDelay: 200,
      recursive: false,
      onChange: ({ refs }) => changes.push(refs),
      onError: (error) => errors.push(error),
      ignored: git.ignored,
    });
  };

  const keepWriting = (
    file: string | readonly string[],
    what: string,
    until = () => changes.includes(false),
    apart = 0,
  ) => {
    const files = typeof file === 'string' ? [file] : file;
    let lines = '';
    let written = -Infinity;
    return waitFor(() => {
      if (Date.now() - written >= apart) {
        written = Date.now();
        lines += 'line\n';
        for (const each of files) {
          fs.writeFileSync(path.resolve(repository.root, each), lines);
        }
      }
      return until();
    }, what);
  };

  const worktreeInBareRepository = async () => {
    const folder = tempFolder('bare');
    const bare = path.join(folder, 'project.git');
    await repository.git('clone', '-q', '--bare', repository.root, bare);
    const worktree = path.join(bare, 'main');
    await repository.git('-C', bare, 'worktree', 'add', '-q', worktree, 'main');
    return { folder, worktree };
  };

  const settled = async (busy = () => false) => {
    await untilQuiet(
      () => changes.length,
      busy,
      'the folders read while starting to be told',
      500,
    );
    changes = [];
  };

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
      watcher = await watchRepository(repository.gitPath, repository.root, {
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
      watcher = await watchRepository(repository.gitPath, repository.root, {
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
      watcher = await watchRepository(repository.gitPath, repository.root, {
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
      watcher = await watchRepository(repository.gitPath, repository.root, {
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
      watcher = await watchRepository(repository.gitPath, repository.root, {
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
    watcher = await watchRepository(repository.gitPath, repository.root, {
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
    watcher = await watchRepository(repository.gitPath, repository.root, {
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

  for (const recursive of [true, false]) {
    test(`asks a submodule whether a file changed in it is ignored, as its superproject refuses to tell, staying quiet for one its own .gitignore ignores and refreshing for one it tracks, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const library = await tempRepository(path.join(repository.root, 'sub'));
      await library.commit('library', { '.gitignore': '*.o\n', 'lib.c': '' });
      await repository.git('add', '--no-warn-embedded-repo', 'sub');
      const built = path.join(library.root, 'lib.o');
      fs.writeFileSync(built, '');
      const checked: string[] = [];
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: (repo, paths) => {
          checked.push(...paths);
          return ignoredPaths(repository.gitPath, repo, paths);
        },
      });
      await settled();
      await keepWriting(built, 'the ignored file in the submodule', () =>
        checked.includes(built),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!changes.includes(false), 'the ignored file in the submodule');
      await keepWriting(path.join('sub', 'lib.c'), 'the file in the submodule');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for ignored files made and removed in a folder that is not ignored, which Windows tells changed along with them, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      fs.appendFileSync(path.join(repository.root, '.gitignore'), '*.tmp\n');
      const folder = path.join(repository.root, 'src');
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'kept.txt'), '');
      const checked: string[] = [];
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: (repo, paths) => {
          checked.push(...paths);
          return ignoredPaths(repository.gitPath, repo, paths);
        },
      });
      await settled();
      for (let made = 0; made < 3; made++) {
        const file = path.join(folder, `x${made}.tmp`);
        fs.writeFileSync(file, '');
        await waitFor(
          () => checked.includes(file) || changes.length > 0,
          'the ignored file made',
        );
        fs.rmSync(file);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!changes.includes(false), 'the ignored files');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for an ignored folder made again, which git tells is not ignored while it is missing, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = path.join(repository.root, 'ignored');
      const git = askingGit();
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: git.ignored,
      });
      await settled(git.busy);
      git.answered.length = 0;
      fs.rmSync(folder, { recursive: true });
      await waitFor(() => git.answered.includes(folder), 'the folder removed');
      await settled(git.busy);
      git.asked.length = 0;
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'out.txt'), '');
      await waitFor(
        () => git.asked.includes(folder) || changes.length > 0,
        'the folder made again',
      );
      await untilQuiet(() => changes.length, git.busy, 'the folder made again');
      assert.ok(!changes.includes(false), 'the folder made again');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for the cookies of the fsmonitor daemon, which every refresh would make again, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const cookies = path.join(
        repository.root,
        '.git',
        'fsmonitor--daemon',
        'cookies',
      );
      fs.mkdirSync(cookies, { recursive: true });
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      fs.writeFileSync(path.join(cookies, '1234-0'), '');
      fs.rmSync(path.join(cookies, '1234-0'));
      await keepWriting(
        'file.txt',
        'the changed file',
        () => changes.length > 0,
      );
      assert.strictEqual(changes.includes(true), false);
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit in a submodule with a folder named like logs in its path, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const sub = await tempRepository(
        path.join(repository.root, 'deps', 'logs', 'parser'),
      );
      await sub.commit('parser');
      fs.writeFileSync(
        path.join(repository.root, '.gitmodules'),
        '[submodule "deps/logs/parser"]\n\tpath = deps/logs/parser\n\turl = ./parser\n',
      );
      await repository.git('add', '--no-warn-embedded-repo', '.');
      await repository.git('submodule', 'absorbgitdirs');
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      await sub.commit('second');
      await waitFor(() => changes.includes(true), 'the commit');
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit in a repository whose git folder is inside the working tree, but stays quiet while only its objects are written, as a fetch or gc there does, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const nested = await tempRepository(path.join(repository.root, 'lib'));
      await nested.commit('library', { 'lib.c': '' });
      await repository.git('add', '--no-warn-embedded-repo', 'lib');
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      const pack = path.join(nested.root, '.git', 'objects', 'pack');
      const until = Date.now() + 600;
      for (let written = 0; Date.now() < until; written++) {
        fs.writeFileSync(path.join(pack, `tmp_pack_${written}`), 'pack');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepStrictEqual(changes, []);
      let commits = 0;
      await waitFor(async () => {
        await nested.commit(`${commits++}`);
        return changes.includes(false);
      }, 'a commit in the nested repository');
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit when .git links to a folder elsewhere, which watching the folder it is in does not follow, watching ${recursive ? 'recursively' : 'folder by folder'}`, async (context) => {
      if (!createsAnewThroughJunctions()) {
        context.skip();
      }
      const store = tempFolder('store');
      const gitDir = path.join(store, 'project.git');
      fs.renameSync(path.join(repository.root, '.git'), gitDir);
      fs.symlinkSync(gitDir, path.join(repository.root, '.git'), 'junction');
      try {
        watcher = await watchRepository(repository.gitPath, repository.root, {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: ({ refs }) => changes.push(refs),
          onError: (error) => errors.push(error),
        });
        await settled();
        let commits = 0;
        await waitFor(async () => {
          await repository.git('commit', '--allow-empty', '-m', `${commits++}`);
          return changes.includes(true);
        }, 'a commit');
        assert.deepStrictEqual(errors, []);
      } finally {
        await watcher?.dispose();
        watcher = undefined;
        removeFolder(store);
      }
    });

    test(`stays quiet for a fetch that brings nothing, though Windows tells the remote's folder changed for the lock it makes on its HEAD, and refreshes refs alone for one that brings commits, a tag or a branch, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const upstream = await tempRepository(tempFolder('upstream'));
      await upstream.commit('one');
      await repository.git('remote', 'add', 'origin', upstream.root);
      await repository.git('fetch', '-q', 'origin');
      const seen: Changed[] = [];
      watcher = await watchRepository(repository.gitPath, repository.root, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: (change) => seen.push(change),
        onError: (error) => errors.push(error),
      });
      try {
        let last = seen.length;
        let since = Date.now();
        await waitFor(() => {
          if (seen.length !== last) {
            last = seen.length;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the folders read while starting to be told');
        seen.length = 0;
        await repository.git('fetch', '--all', '--prune');
        await keepWriting(
          'file.txt',
          'the changed file',
          () => seen.length > 0,
        );
        assert.deepStrictEqual(
          seen.filter((change) => change.refs),
          [],
          'the fetch that brought nothing',
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        for (const change of [
          () => upstream.commit('two'),
          () => upstream.git('tag', 'v1'),
          () => upstream.git('branch', 'feature'),
        ]) {
          await change();
          seen.length = 0;
          await repository.git('fetch', '--all', '--prune');
          await waitFor(() => seen.length > 0, 'the fetch');
          await new Promise((resolve) => setTimeout(resolve, 300));
          assert.ok(
            seen.every((told) => told.refs && !told.workingTree),
            JSON.stringify(seen),
          );
        }
        seen.length = 0;
        await repository.git('commit', '--allow-empty', '-m', 'local');
        await waitFor(
          () => seen.some((told) => told.refs && told.workingTree),
          'a commit',
        );
        assert.deepStrictEqual(errors, []);
      } finally {
        removeFolder(upstream.root);
      }
    });

    test(`tells when a worktree is added, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('listed');
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let added = 0;
        await waitFor(async () => {
          await repository.git(
            'worktree',
            'add',
            '-q',
            '--detach',
            path.join(folder, `linked-${added++}`),
          );
          return listed > 0;
        }, 'a worktree added');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree switches branch, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('switched');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktree added to be told');
        listed = 0;
        await repository.git('-C', linked, 'switch', '-q', '-c', 'switched');
        await waitFor(() => listed > 0, 'the branch switched to');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree or the main one switches branch under the reftable ref format, which leaves each HEAD file as it was, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      await repository.git('refs', 'migrate', '--ref-format=reftable');
      const folder = tempFolder('reftable');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      const switched = async (where: string, what: string) => {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktrees listed to be told');
        listed = 0;
        await repository.git('-C', where, 'switch', '-q', '-c', what);
        await waitFor(() => listed > 0, what);
      };
      try {
        await switched(linked, 'linked-switched');
        await switched(repository.root, 'main-switched');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree switches branch among more changes than Windows tells at once, which it drops, telling only that something changed, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('dropped');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      await repository.git('branch', 'switched');
      const linkedGitDir = path.join(repository.root, '.git/worktrees/linked');
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktree added to be told');
        listed = 0;
        for (let file = 0; file < 300; file++) {
          fs.writeFileSync(path.join(linkedGitDir, `written-${file}`), '');
        }
        fs.writeFileSync(
          path.join(linkedGitDir, 'HEAD'),
          'ref: refs/heads/switched\n',
        );
        await waitFor(() => listed > 0, 'the branch switched to');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`refreshes a linked worktree for a branch made in the main one, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('linked');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      const seen: boolean[] = [];
      const linkedWatcher = await watchRepository(repository.gitPath, linked, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
      });
      try {
        let branches = 0;
        await waitFor(async () => {
          await repository.git('branch', `made-${branches++}`);
          return seen.includes(true);
        }, 'the branch');
        assert.deepStrictEqual(errors, []);
      } finally {
        await linkedWatcher.dispose();
        removeFolder(folder);
      }
    });

    test(`refreshes a worktree inside its bare repository's folder for a file changed two folders down, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const { folder, worktree } = await worktreeInBareRepository();
      const file = path.join(worktree, 'src', 'deep', 'file.txt');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '');
      const seen: boolean[] = [];
      const watching = await watchRepository(repository.gitPath, worktree, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
      });
      try {
        await keepWriting(file, 'the changed file', () => seen.includes(false));
        assert.deepStrictEqual(errors, []);
      } finally {
        await watching.dispose();
        removeFolder(folder);
      }
    });
  }
});

suite('Telling the ignored paths', () => {
  let repository: TempRepository;

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('ignored'));
    fs.writeFileSync(
      path.join(repository.root, '.gitignore'),
      'ignored/\n/build\n',
    );
    fs.mkdirSync(path.join(repository.root, 'ignored'));
  });

  afterAll(() => removeFolder(repository.root));

  test('tells the ignored folders', async () => {
    const kept = path.join(repository.root, 'kept');
    fs.mkdirSync(kept);
    const ignored = path.join(repository.root, 'ignored');
    assert.deepStrictEqual(
      await ignoredPaths(repository.gitPath, repository.root, [kept, ignored]),
      [ignored],
    );
  });

  test('tells the ignored folders among ones named like pathspec magic', async () => {
    fs.appendFileSync(path.join(repository.root, '.gitignore'), ':!tmp\n');
    const magic = path.join(repository.root, ':!tmp');
    assert.deepStrictEqual(
      await ignoredPaths(repository.gitPath, repository.root, [
        path.join(repository.root, ':-)'),
        magic,
        path.join(repository.root, 'ignored'),
      ]),
      [magic, path.join(repository.root, 'ignored')],
    );
  });

  test('tells a path named like pathspec magic from the ignored one it names', async () => {
    const build = path.join(repository.root, 'build');
    assert.deepStrictEqual(
      await ignoredPaths(repository.gitPath, repository.root, [
        path.join(repository.root, ':build'),
        build,
      ]),
      [build],
    );
  });
});
