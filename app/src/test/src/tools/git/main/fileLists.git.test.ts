import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  listIndex,
  listTree,
  untrackedListing,
} from '../../../../../tools/git/main/fileLists';
import { replaceBuiltin } from '../../../../helpers/builtins';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';

suite('Repository files', () => {
  let parent: string;
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    parent = tempFolder('files');
    repository = await tempRepository(path.join(parent, 'repository'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  afterAll(() => removeFolder(parent));

  test('lists the files at a commit and in the working tree', async () => {
    assert.deepStrictEqual(await listTree(gitPath, cwd, 'HEAD'), [
      'src/tracked.txt',
    ]);
    assert.deepStrictEqual(
      (await listTree(gitPath, cwd, undefined)).toSorted(),
      ['src/tracked.txt', 'untracked.txt'],
    );
  });

  test('lists the untracked files of the working tree as the uncommitted changes list them, through git status with its cache of folders on Windows, as ls-files read each folder anew', async () => {
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    const started: string[][] = [];
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        started.push([...args]);
        return spawn(command, args, options);
      },
    );
    try {
      assert.deepStrictEqual(
        (await listTree(gitPath, cwd, undefined)).toSorted(),
        ['src/tracked.txt', 'untracked.txt'],
      );
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
    const listing = untrackedListing().args.join(' ');
    assert.ok(
      started.some((args) => args.join(' ').endsWith(listing)),
      JSON.stringify(started),
    );
  });

  test('lists in the working tree only the files a sparse checkout put there, though the index has them all, and all at a commit', async () => {
    const sparse = await tempRepository(path.join(parent, 'sparse'));
    await sparse.commit('initial', {
      'in/a.txt': 'a\n',
      'out/b.txt': 'b\n',
      'top.txt': 'top\n',
    });
    await sparse.git('sparse-checkout', 'set', 'in');
    fs.writeFileSync(path.join(sparse.root, 'new.txt'), 'new\n');
    assert.deepStrictEqual(
      (await listTree(gitPath, sparse.root, undefined)).toSorted(),
      ['in/a.txt', 'new.txt', 'top.txt'],
    );
    assert.deepStrictEqual((await listIndex(gitPath, sparse.root)).toSorted(), [
      'in/a.txt',
      'top.txt',
    ]);
    assert.deepStrictEqual(
      (await listTree(gitPath, sparse.root, 'HEAD')).toSorted(),
      ['in/a.txt', 'out/b.txt', 'top.txt'],
    );
  });
});
