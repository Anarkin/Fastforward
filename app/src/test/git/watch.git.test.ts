import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ignoredPaths,
  watchRepository,
  type Changed,
  type Watcher,
} from '../../git/watch';
import { waitFor } from '../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

suite('Watching a repository', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let watcher: Watcher | undefined;
  let changes: boolean[];
  let errors: unknown[];

  setup(async () => {
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

  teardown(async () => {
    await watcher?.dispose();
    watcher = undefined;
    removeFolder(repository.root);
  });

  const start = async () => {
    watcher = await watchRepository(repository.gitPath, repository.root, {
      delay: 50,
      maxDelay: 200,
      recursive: false,
      onChange: ({ refs }) => changes.push(refs),
      onError: (error) => errors.push(error),
    });
  };

  const keepWriting = (
    file: string,
    what: string,
    until = () => changes.includes(false),
  ) => {
    let lines = '';
    return waitFor(() => {
      lines += 'line\n';
      fs.writeFileSync(path.resolve(repository.root, file), lines);
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

  const settled = async () => {
    let last = changes.length;
    let since = Date.now();
    await waitFor(() => {
      if (changes.length !== last) {
        last = changes.length;
        since = Date.now();
      }
      return Date.now() - since > 500;
    }, 'the folders read while starting to be told');
    changes = [];
  };

  test('refreshes for a file in a folder created after it started, watching folder by folder', async () => {
    await start();
    let made = 0;
    let folder = '';
    await waitFor(() => {
      folder = path.join(repository.root, `new-${made++}`, 'deep');
      fs.mkdirSync(folder, { recursive: true });
      return changes.length > 0;
    }, 'a new folder');
    await settled();
    await keepWriting(path.join(folder, 'file.txt'), 'the new file');
    assert.deepStrictEqual(errors, []);
  });

  test("refreshes for a file whose name starts with '..', which is not a parent folder, watching folder by folder", async () => {
    await start();
    await keepWriting('..env', 'the file');
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a file named like pathspec magic, though the file it names is ignored, watching folder by folder', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    await start();
    await keepWriting(':build', 'the file');
    assert.deepStrictEqual(errors, []);
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
    try {
      await start();
      await settled();
      fs.renameSync(moduleDir, path.join(library.root, '.git'));
      fs.mkdirSync(path.join(library.root, 'src'));
      await settled();
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
    const asked: string[] = [];
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
        ignored: (repo, paths) => {
          asked.push(...paths);
          return ignoredPaths(repository.gitPath, repo, paths);
        },
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
      fs.writeFileSync(
        path.join(repository.root, '.gitignore'),
        'ignored/\n/build\n/file.txt\n',
      );
      await waitFor(() => seen.includes(false), 'the .gitignore');
      let last = seen.length;
      let since = Date.now();
      await waitFor(() => {
        if (seen.length !== last) {
          last = seen.length;
          since = Date.now();
        }
        return Date.now() - since > 300;
      }, 'the .gitignore to be told');
      asked.length = 0;
      seen.length = 0;
      await keepWriting(file, 'the file now ignored', () =>
        asked.includes(file),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!seen.includes(false), 'the file now ignored');
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
    const checked: string[] = [];
    const seen: boolean[] = [];
    const watching = await watchRepository(repository.gitPath, worktree, {
      delay: 50,
      maxDelay: 200,
      recursive: true,
      onChange: ({ refs }) => seen.push(refs),
      onError: (error) => errors.push(error),
      ignored: (repo, paths) => {
        checked.push(...paths);
        return ignoredPaths(repository.gitPath, repo, paths);
      },
    });
    try {
      fs.mkdirSync(built);
      await waitFor(() => checked.includes(built), 'the ignored folder');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!seen.includes(false), JSON.stringify(checked));
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
    test(`asks a submodule whether a file changed in it is ignored, staying quiet for one its own .gitignore ignores and refreshing for one it tracks, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
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
      fs.rmSync(folder, { recursive: true });
      await waitFor(() => checked.includes(folder), 'the folder removed');
      await settled();
      checked.length = 0;
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'out.txt'), '');
      await waitFor(
        () => checked.includes(folder) || changes.length > 0,
        'the folder made again',
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
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

    test(`refreshes for a commit when .git links to a folder elsewhere, which watching the folder it is in does not follow, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
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

    test(`stays quiet for a fetch that brings nothing, and refreshes refs alone for one that brings commits, a tag or a branch, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
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

suite('Telling the ignored paths', function () {
  this.timeout(20_000);
  let repository: TempRepository;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('ignored'));
    fs.writeFileSync(
      path.join(repository.root, '.gitignore'),
      'ignored/\n/build\n',
    );
    fs.mkdirSync(path.join(repository.root, 'ignored'));
  });

  suiteTeardown(() => removeFolder(repository.root));

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
