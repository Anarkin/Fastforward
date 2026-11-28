import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { blobSizes, readObjects } from '../../../../../tools/git/main/objects';
import {
  maxFileSize,
  readBlobs,
  readFile,
} from '../../../../../tools/git/main/files';
import {
  keepGitRunningWhile,
  runningGits,
} from '../../../../../tools/git/main/run';
import { gitsStarted, tempRepository } from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Repository files', () => {
  test('reads files and objects through one git kept running once that is turned on, starting no other git for later reads, with what a git started for each read gives', async () => {
    const folder = tempFolder('kept-blobs');
    keepGitRunningWhile(() => true);
    try {
      const kept = await tempRepository(folder);
      await kept.commit('first', {
        'a.ts': 'one\n',
        'image.png': Buffer.from([0, 1, 2]).toString('latin1'),
        'large.txt': 'x'.repeat(maxFileSize + 1),
      });
      await kept.commit('second', { 'a.ts': 'two\n' });
      const [head = '', oldA = '', newA = '', image = '', large = ''] =
        await kept.resolve(
          'HEAD',
          'HEAD~1:a.ts',
          'HEAD:a.ts',
          'HEAD:image.png',
          'HEAD:large.txt',
        );
      const ids = [oldA, newA, image, large, 'f'.repeat(40)];

      const first = await gitsStarted(() =>
        readBlobs(kept.gitPath, kept.root, ids),
      );
      const again = await gitsStarted(async () => ({
        texts: await readBlobs(kept.gitPath, kept.root, ids),
        file: await readFile(kept.gitPath, kept.root, head, 'a.ts'),
        sizes: await blobSizes(kept.gitPath, kept.root, [
          newA,
          large,
          'f'.repeat(40),
        ]),
      }));

      assert.deepStrictEqual(
        [...first.result],
        [
          [oldA, 'one\n'],
          [newA, 'two\n'],
        ],
      );
      assert.ok(first.gits <= 2, String(first.gits));
      assert.deepStrictEqual([...again.result.texts], [...first.result]);
      assert.deepStrictEqual(again.result.file, {
        content: 'two\n',
        binary: false,
      });
      assert.deepStrictEqual(
        [...again.result.sizes],
        [
          [newA, 4],
          [large, maxFileSize + 1],
        ],
      );
      assert.strictEqual(again.gits, 0);
    } finally {
      keepGitRunningWhile(() => false);
      runningGits.stopAll();
      removeFolder(folder);
    }
  });

  test('reads many objects a few at a time, in the order asked, so no git started for them passes the most output a git may give, as a commit of hundreds of images showed an error rather than its diff', async () => {
    const folder = tempFolder('objects-at-once');
    try {
      const repository = await tempRepository(folder);
      const files = Object.fromEntries(
        Array.from({ length: 5 }, (_, index) => [`f${index}.bin`, `${index}`]),
      );
      await repository.commit('many', files);
      const ids = await repository.resolve(
        ...Object.keys(files).map((file) => `HEAD:${file}`),
      );

      await gitsStarted(() =>
        readObjects(
          repository.gitPath,
          repository.root,
          ids.slice(0, 2),
          maxFileSize,
          2,
        ),
      );
      const read = await gitsStarted(() =>
        readObjects(repository.gitPath, repository.root, ids, maxFileSize, 2),
      );

      assert.deepStrictEqual(
        read.result.map((each) =>
          each.kind === 'object' ? each.content.toString() : each.kind,
        ),
        ['0', '1', '2', '3', '4'],
      );
      assert.strictEqual(read.gits, 3);
    } finally {
      removeFolder(folder);
    }
  });

  test('reads a large file through a git started for it rather than the one kept, so the diffs and files of the folder do not wait behind it', async () => {
    const folder = tempFolder('kept-large-blob');
    keepGitRunningWhile(() => true);
    try {
      const kept = await tempRepository(folder);
      const size = Math.floor(maxFileSize * 0.75);
      await kept.commit('first', {
        'small.txt': 'small\n',
        'large.txt': 'x'.repeat(size),
      });
      const [small = '', large = ''] = await kept.resolve(
        'HEAD:small.txt',
        'HEAD:large.txt',
      );
      await readBlobs(kept.gitPath, kept.root, [small]);

      const read = await gitsStarted(async () => ({
        large: await readBlobs(kept.gitPath, kept.root, [large]),
        small: await readBlobs(kept.gitPath, kept.root, [small]),
      }));

      assert.strictEqual(read.result.large.get(large)?.length, size);
      assert.strictEqual(read.result.small.get(small), 'small\n');
      assert.strictEqual(read.gits, 1);
    } finally {
      keepGitRunningWhile(() => false);
      runningGits.stopAll();
      removeFolder(folder);
    }
  });

  test('reads a name no object id fixes, such as a path in the index, through a git started for it rather than the one kept, as a git kept running reads the index once and would answer for it as it was', async () => {
    const folder = tempFolder('kept-index');
    keepGitRunningWhile(() => true);
    try {
      const kept = await tempRepository(folder);
      await kept.commit('first', { 'a.txt': 'one\n' });
      const [first = ''] = await kept.resolve(':0:a.txt');
      const before = await blobSizes(kept.gitPath, kept.root, [':0:a.txt']);
      fs.writeFileSync(path.join(kept.root, 'a.txt'), 'three\n');
      await kept.git('add', 'a.txt');
      const [staged = ''] = await kept.resolve(':0:a.txt');

      const after = await blobSizes(kept.gitPath, kept.root, [':0:a.txt']);

      assert.deepStrictEqual([...before], [[first, 4]]);
      assert.deepStrictEqual([...after], [[staged, 6]]);
    } finally {
      keepGitRunningWhile(() => false);
      runningGits.stopAll();
      removeFolder(folder);
    }
  });

  test('sends the git kept running no name holding a NUL or a newline, as it would take the rest for a request of its own and answer every later one out of step', async () => {
    const folder = tempFolder('kept-split-name');
    keepGitRunningWhile(() => true);
    try {
      const kept = await tempRepository(folder);
      await kept.commit('first', { 'a.txt': 'one\n', 'b.txt': 'two\n' });
      const [head = ''] = await kept.resolve('HEAD');
      const read = (name: string) =>
        readFile(kept.gitPath, kept.root, head, name).then(
          (file) => file.content,
          () => undefined,
        );
      assert.strictEqual(await read('a.txt'), 'one\n');
      for (const name of [
        `a.txt\0info ${head}:b.txt`,
        `a.txt\ncontents ${head}:b.txt`,
      ]) {
        assert.notStrictEqual(await read(name), 'two\n');
        assert.strictEqual(await read('b.txt'), 'two\n');
        assert.strictEqual(await read('a.txt'), 'one\n');
      }
    } finally {
      keepGitRunningWhile(() => false);
      runningGits.stopAll();
      removeFolder(folder);
    }
  });

  test('tells a link git checked out as a file of one line through the git kept running, starting none for each file read, and anew once the index changes, as a git started for each such file took a fraction of a second on Windows', async () => {
    const folder = tempFolder('kept-links');
    keepGitRunningWhile(() => true);
    try {
      const links = await tempRepository(folder);
      await links.git('config', 'core.symlinks', 'false');
      await links.commit('files', {
        README: 'read me\n',
        'a.txt': 'README',
        'b.txt': 'README',
      });
      const read = (file: string) =>
        readFile(links.gitPath, links.root, undefined, file);
      const file = { content: 'README', binary: false };
      await read('a.txt');
      assert.deepStrictEqual(
        await gitsStarted(async () => [
          await read('a.txt'),
          await read('b.txt'),
        ]),
        { result: [file, file], gits: 0 },
      );
      const [blob = ''] = await links.resolve('HEAD:a.txt');
      await links.git('update-index', '--cacheinfo', `120000,${blob},b.txt`);
      assert.deepStrictEqual(await read('b.txt'), { ...file, link: true });
      assert.deepStrictEqual(await read('a.txt'), file);
    } finally {
      keepGitRunningWhile(() => false);
      runningGits.stopAll();
      removeFolder(folder);
    }
  });
});
