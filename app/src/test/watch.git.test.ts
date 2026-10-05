import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ignoredPaths, watchRepository, type Watcher } from '../git/watch';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Watching a repository folder by folder, as on Linux', function () {
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
    watcher = await watchRepository(repository.gitPath, repository.root, {
      delay: 50,
      maxDelay: 200,
      recursive: false,
      onChange: (gitDirChanged) => changes.push(gitDirChanged),
      onError: (error) => errors.push(error),
    });
  });

  teardown(() => {
    watcher?.dispose();
    removeFolder(repository.root);
  });

  const keepWriting = (file: string, what: string) => {
    let lines = '';
    return waitFor(() => {
      lines += 'line\n';
      fs.writeFileSync(path.join(repository.root, file), lines);
      return changes.includes(false);
    }, what);
  };

  test('refreshes for a file in a folder created after it started', async () => {
    const folder = path.join(repository.root, 'new', 'deep');
    fs.mkdirSync(folder, { recursive: true });
    await waitFor(() => changes.length > 0, 'the new folder');
    changes = [];
    await keepWriting(path.join('new', 'deep', 'file.txt'), 'the new file');
    assert.deepStrictEqual(errors, []);
  });

  test("refreshes for a file whose name starts with '..', which is not a parent folder", async () => {
    await keepWriting('..env', 'the file');
    assert.deepStrictEqual(errors, []);
  });

  test('refreshes for a file named like pathspec magic, though the file it names is ignored', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    await keepWriting(':build', 'the file');
    assert.deepStrictEqual(errors, []);
  });

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

  test('refreshes for the git folder', async () => {
    await repository.git('commit', '--allow-empty', '-m', 'second');
    await waitFor(() => changes.includes(true), 'the commit');
    assert.deepStrictEqual(errors, []);
  });

  test('stays quiet when stopped while telling whether the changed files are ignored', async () => {
    let asked = false;
    let answer: ((ignored: readonly string[]) => void) | undefined;
    const quiet: boolean[] = [];
    const stopped = await watchRepository(repository.gitPath, repository.root, {
      delay: 0,
      maxDelay: 0,
      recursive: false,
      onChange: (gitDirChanged) => quiet.push(gitDirChanged),
      onError: (error) => errors.push(error),
      ignored: (_repo, paths) => {
        if (!paths.some((file) => path.basename(file) === 'file.txt')) {
          return Promise.resolve([]);
        }
        asked = true;
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    });
    let lines = '';
    await waitFor(() => {
      lines += 'line\n';
      fs.writeFileSync(path.join(repository.root, 'file.txt'), lines);
      return asked;
    }, 'the changed file to be checked');
    stopped.dispose();
    answer?.([]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepStrictEqual(quiet, []);
    assert.deepStrictEqual(errors, []);
  });

  for (const recursive of [true, false]) {
    test(`refreshes a linked worktree for a branch made in the main one, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('linked');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      const seen: boolean[] = [];
      const linkedWatcher = await watchRepository(repository.gitPath, linked, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: (gitDirChanged) => seen.push(gitDirChanged),
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
        linkedWatcher.dispose();
        removeFolder(folder);
      }
    });
  }
});
