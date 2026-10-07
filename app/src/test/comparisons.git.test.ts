import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareFiles, comparePatch } from '../git/diff';
import {
  workingTreeFiles,
  workingTreePatch,
  type UntrackedPatches,
} from '../git/workingTree';
import { parsePatch } from '../webview/diff';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Comparing two commits', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let feature: string;
  let main: string;
  let unrelated: string;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('compare'));
    await repository.commit('root', { 'shared.txt': 'one\ntwo\n' });
    await repository.git('checkout', '-b', 'feature');
    await repository.commit('feature', {
      'shared.txt': 'one\nfeature\n',
      'feature.txt': 'feature only\n',
    });
    await repository.git('checkout', 'main');
    await repository.commit('main', { 'main.txt': 'main only\n' });
    await repository.git('checkout', '-q', '--orphan', 'unrelated');
    await repository.git('rm', '-q', '-r', '-f', '.');
    await repository.commit('unrelated', { 'other.txt': 'other\n' });
    await repository.git('checkout', '-q', 'main');
    [feature, main, unrelated] = await repository.resolve(
      'feature',
      'main',
      'unrelated',
    );
  });

  suiteTeardown(() => removeFolder(repository.root));

  test('lists every file whose content differs between commits on different branches', async () => {
    const files = await compareFiles(
      repository.gitPath,
      repository.root,
      feature,
      main,
    );
    assert.deepStrictEqual(
      files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['D', 'feature.txt', 0, 1],
        ['A', 'main.txt', 1, 0],
        ['M', 'shared.txt', 1, 1],
      ],
    );
  });

  test('diffs from the first commit to the second', async () => {
    const patch = await comparePatch(
      repository.gitPath,
      repository.root,
      main,
      feature,
      { path: 'shared.txt' },
    );
    assert.match(patch, /^-two$/m);
    assert.match(patch, /^\+feature$/m);
  });

  test('compares commits with no history in common', async () => {
    const files = await compareFiles(
      repository.gitPath,
      repository.root,
      main,
      unrelated,
    );
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['D', 'main.txt'],
        ['A', 'other.txt'],
        ['D', 'shared.txt'],
      ],
    );
    const patch = await comparePatch(
      repository.gitPath,
      repository.root,
      main,
      unrelated,
    );
    assert.deepStrictEqual(
      parsePatch(patch).map((file) => file.path),
      ['main.txt', 'other.txt', 'shared.txt'],
    );
  });
});

suite('Comparing a commit with the working tree', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let first: string;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('compare-working-tree'));
    await repository.commit('first', { 'kept.txt': 'one\n' });
    await repository.commit('second', {
      'kept.txt': 'two\n',
      'later.txt': 'later\n',
    });
    [first] = await repository.resolve('HEAD~1');
    fs.writeFileSync(path.join(repository.root, 'kept.txt'), 'three\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(repository.root));

  test('diffs from the commit to the files on disk', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: false },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['A', 'later.txt', 1, 0],
        ['U', 'new.txt', 1, 0],
      ],
    );
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.match(patch, /^-one$/m);
    assert.match(patch, /^\+three$/m);
    assert.match(patch, /^\+new$/m);
  });

  test('diffs from the files on disk to the commit, an untracked file as deleted', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: true },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['D', 'later.txt', 0, 1],
        ['D', 'new.txt', 0, 1],
      ],
    );
    assert.ok(workingTree.files.every((file) => (file.bytes ?? 0) > 0));
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.deepStrictEqual(
      parsePatch(patch).map((file) => file.path),
      ['kept.txt', 'later.txt', 'new.txt'],
    );
    assert.match(patch, /^-three$/m);
    assert.match(patch, /^\+one$/m);
    assert.match(patch, /^-new$/m);
    const alone = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
      { path: 'new.txt' },
    );
    assert.match(alone, /^-new$/m);
  });

  test('diffs an untracked file again when the direction changes, not reusing the patch kept', async () => {
    const patches: UntrackedPatches = new Map();
    const patchOf = async (reverse: boolean) =>
      workingTreePatch(
        repository.gitPath,
        repository.root,
        await workingTreeFiles(repository.gitPath, repository.root, {
          base: first,
          reverse,
        }),
        { path: 'new.txt' },
        patches,
      );
    assert.match(await patchOf(false), /^\+new$/m);
    assert.match(await patchOf(true), /^-new$/m);
    assert.match(await patchOf(false), /^\+new$/m);
  });

  test('leaves out a file only touched on disk, in either direction', async () => {
    const file = path.join(repository.root, 'later.txt');
    const past = new Date(Date.UTC(2020, 0, 1));
    fs.utimesSync(file, past, past);
    try {
      for (const reverse of [false, true]) {
        const { files } = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          { base: 'HEAD', reverse },
        );
        assert.deepStrictEqual(
          files.map((change) => change.path),
          ['kept.txt', 'new.txt'],
        );
      }
    } finally {
      const now = new Date();
      fs.utimesSync(file, now, now);
    }
  });
});
