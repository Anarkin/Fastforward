import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { workingTreeFiles } from '../../../../../tools/git/main/workingTree';
import {
  UntrackedPatches,
  workingTreePatch,
} from '../../../../../tools/git/main/workingTreePatch';
import { parsePatch } from '../../../../../tools/git/page/diff';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { holdingGit } from './workingTreeFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Comparing a commit with the working tree', () => {
  let repository: TempRepository;
  let first: string;

  beforeAll(async () => {
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

  afterAll(() => removeFolder(repository.root));

  test('lists the comparison from the untracked files a listing of the working tree found, without asking git for them again, as listing it anew would', async () => {
    await repository.git('rm', '-q', '--cached', 'kept.txt');
    try {
      const listing = await workingTreeFiles(
        repository.gitPath,
        repository.root,
      );
      for (const reverse of [false, true]) {
        const diff = { base: first, reverse };
        const fresh = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          diff,
        );
        const recording = holdingGit(() => false);
        try {
          const reused = await workingTreeFiles(
            repository.gitPath,
            repository.root,
            diff,
            undefined,
            listing.listedUntracked,
          );
          assert.deepStrictEqual(reused, fresh);
          assert.ok(!recording.started('--untracked-files=all'));
          assert.ok(!recording.started('--others'));
        } finally {
          recording.release();
        }
      }
    } finally {
      await repository.git('reset', '-q', '--', 'kept.txt');
    }
  });

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
    const patches = new UntrackedPatches(Infinity);
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
