import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ignoredFolders, watchRepository, type Watcher } from '../git/watch';
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
    fs.writeFileSync(path.join(repository.root, '.gitignore'), 'ignored/\n');
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

  test('refreshes for a file in a folder created after it started', async () => {
    const folder = path.join(repository.root, 'new', 'deep');
    fs.mkdirSync(folder, { recursive: true });
    await waitFor(() => changes.length > 0, 'the new folder');
    changes = [];
    let lines = '';
    await waitFor(() => {
      lines += 'line\n';
      fs.writeFileSync(path.join(folder, 'file.txt'), lines);
      return changes.includes(false);
    }, 'the new file');
    assert.deepStrictEqual(errors, []);
  });

  test('tells the ignored folders', async () => {
    const kept = path.join(repository.root, 'kept');
    fs.mkdirSync(kept);
    const ignored = path.join(repository.root, 'ignored');
    assert.deepStrictEqual(
      await ignoredFolders(repository.gitPath, repository.root, [
        kept,
        ignored,
      ]),
      [ignored],
    );
  });

  test('tells the ignored folders among ones named like pathspec magic', async () => {
    fs.appendFileSync(path.join(repository.root, '.gitignore'), ':!tmp\n');
    const magic = path.join(repository.root, ':!tmp');
    assert.deepStrictEqual(
      await ignoredFolders(repository.gitPath, repository.root, [
        path.join(repository.root, ':-)'),
        magic,
        path.join(repository.root, 'ignored'),
      ]),
      [magic, path.join(repository.root, 'ignored')],
    );
  });

  test('refreshes for the git folder', async () => {
    await repository.git('commit', '--allow-empty', '-m', 'second');
    await waitFor(() => changes.includes(true), 'the commit');
    assert.deepStrictEqual(errors, []);
  });
});
