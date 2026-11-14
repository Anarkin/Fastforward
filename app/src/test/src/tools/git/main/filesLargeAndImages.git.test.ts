import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { showPatch } from '../../../../../tools/git/main/diff';
import {
  maxFileSize,
  readBlobs,
  readFile,
  readImage,
} from '../../../../../tools/git/main/files';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { submoduleRepository } from '../../../../helpers/gitFixtures';
import {
  gitsStarted,
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';

suite('Large files and submodules', () => {
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  let inner: string;

  beforeAll(async () => {
    ({ repository, inner } = await submoduleRepository('large', {
      'large.txt': 'x'.repeat(2 * 1024 * 1024 + 1),
      'exact.txt': 'x'.repeat(2 * 1024 * 1024),
    }));
    gitPath = repository.gitPath;
    cwd = repository.root;
  });

  afterAll(() => removeFolder(cwd));

  test('shows a file over 2 MB as binary, by its object id at a commit, and one of exactly 2 MB as text', async () => {
    const [object] = await repository.resolve('HEAD:large.txt');
    const { size, mtimeMs } = fs.statSync(path.join(cwd, 'large.txt'));
    for (const [hash, id] of [
      ['HEAD', object],
      [undefined, `${size}-${mtimeMs}`],
    ]) {
      assert.deepStrictEqual(await readFile(gitPath, cwd, hash, 'large.txt'), {
        content: '',
        binary: true,
        id,
      });
      const exact = await readFile(gitPath, cwd, hash, 'exact.txt');
      assert.strictEqual(exact.binary, false);
      assert.strictEqual(exact.content.length, 2 * 1024 * 1024);
    }
  });

  test('shows a submodule by its commit', async () => {
    const submodule = {
      content: `Subproject commit ${inner}\n`,
      binary: false,
    };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'sub'),
      submodule,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'sub'),
      submodule,
    );
  });

  test('shows a submodule that is not checked out as empty', async () => {
    fs.mkdirSync(path.join(cwd, 'unchecked'));
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'unchecked'),
        { content: '', binary: false },
      );
    } finally {
      fs.rmSync(path.join(cwd, 'unchecked'), { recursive: true });
    }
  });
});

suite('Blobs', () => {
  test('reads both sides of the files a patch changes by their full ids, leaving out what is missing, binary or too large', async () => {
    const folder = tempFolder('blobs');
    try {
      const repository = await tempRepository(folder);
      const { gitPath, root } = repository;
      await repository.commit('first', {
        'a.ts': 'one\n',
        'image.png': Buffer.from([0, 1, 2]).toString('latin1'),
        'large.txt': 'x'.repeat(maxFileSize + 1),
      });
      await repository.commit('second', {
        'a.ts': 'two\n',
        'image.png': Buffer.from([0, 3]).toString('latin1'),
        'large.txt': 'y'.repeat(maxFileSize + 1),
      });
      const files = parsePatch(await showPatch(gitPath, root, 'HEAD'));
      const [a, image, large] = files.map((file) => file.blobs);
      const texts = await readBlobs(gitPath, root, [
        a?.old ?? '',
        a?.new ?? '',
        image?.new ?? '',
        large?.new ?? '',
        'f'.repeat(40),
      ]);
      assert.deepStrictEqual([...texts.values()], ['one\n', 'two\n']);
      assert.strictEqual(texts.get(a?.new ?? ''), 'two\n');
      assert.deepStrictEqual(await readBlobs(gitPath, root, []), new Map());
      const { gits } = await gitsStarted(() =>
        readBlobs(gitPath, root, [a?.new ?? '', large?.new ?? '']),
      );
      assert.strictEqual(gits, 1);
    } finally {
      removeFolder(folder);
    }
  });
});

suite('Images', () => {
  let folder: string;
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  const pixel = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);

  beforeAll(async () => {
    folder = tempFolder('images');
    repository = await tempRepository(folder);
    gitPath = repository.gitPath;
    cwd = repository.root;
    fs.writeFileSync(path.join(cwd, 'pixel.png'), pixel);
    fs.writeFileSync(
      path.join(cwd, 'huge.png'),
      Buffer.alloc(pixel.length + 1),
    );
    await repository.git('add', 'pixel.png', 'huge.png');
    await repository.git('commit', '-m', 'images');
  });

  afterAll(() => removeFolder(folder));

  const image = async (id: string, disk: boolean, file = 'pixel.png') =>
    readImage(gitPath, cwd, { path: file, id, disk }, pixel.length);

  test('reads an image by its object id, or from the working tree', async () => {
    const [object] = await repository.resolve('HEAD:pixel.png');
    assert.deepStrictEqual(await image(object, false), {
      kind: 'image',
      bytes: pixel,
    });
    fs.writeFileSync(path.join(cwd, 'pixel.png'), Buffer.from([0, 9]));
    try {
      assert.deepStrictEqual(await image('any', true), {
        kind: 'image',
        bytes: Buffer.from([0, 9]),
      });
    } finally {
      fs.writeFileSync(path.join(cwd, 'pixel.png'), pixel);
    }
  });

  test('reads no image that is missing or too large to preview', async () => {
    const [huge] = await repository.resolve('HEAD:huge.png');
    assert.deepStrictEqual(await image(huge, false), { kind: 'tooLarge' });
    assert.deepStrictEqual(await image('any', true, 'huge.png'), {
      kind: 'tooLarge',
    });
    const [tree] = await repository.resolve('HEAD^{tree}');
    for (const id of ['f'.repeat(40), tree]) {
      assert.deepStrictEqual(await image(id, false), { kind: 'missing' });
    }
    fs.mkdirSync(path.join(cwd, 'folder.png'));
    try {
      for (const file of ['gone.png', 'folder.png']) {
        assert.deepStrictEqual(await image('any', true, file), {
          kind: 'missing',
        });
      }
    } finally {
      fs.rmdirSync(path.join(cwd, 'folder.png'));
    }
  });

  test('reads an image with one git, by its object id', async () => {
    const [object] = await repository.resolve('HEAD:pixel.png');
    for (const source of [{ path: 'pixel.png', id: object, disk: false }]) {
      const { gits } = await gitsStarted(() =>
        readImage(gitPath, cwd, source, pixel.length),
      );
      assert.strictEqual(gits, 1, JSON.stringify(source));
    }
  });

  test('reads no image outside the repository', async () => {
    await assert.rejects(
      image('any', true, '../outside.png'),
      /outside the repository/,
    );
  });

  test('reads no image in the working tree that is itself a symlink, as git sees no image there, so a link leads nowhere outside the repository', async (context) => {
    const outside = tempFolder('outside-image');
    fs.writeFileSync(path.join(outside, 'secret.png'), pixel);
    const link = path.join(cwd, 'link.png');
    try {
      symlinkOrSkip(context, path.join(outside, 'secret.png'), link);
      assert.deepStrictEqual(await image('any', true, 'link.png'), {
        kind: 'missing',
      });
    } finally {
      fs.rmSync(link, { force: true });
      removeFolder(outside);
    }
  });
});
