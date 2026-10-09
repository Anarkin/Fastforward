import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { showPatch } from '../../git/diff';
import {
  listTree,
  maxFileSize,
  readBlobs,
  readFile,
  readImage,
} from '../../git/files';
import { parsePatch } from '../../webview/diff';
import { submoduleRepository } from '../gitFixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

async function gitsStarted<T>(
  run: () => Promise<T>,
): Promise<{ readonly result: T; readonly gits: number }> {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  let gits = 0;
  Reflect.set(childProcess, 'spawn', (...args: Parameters<typeof spawn>) => {
    gits++;
    return spawn(...args);
  });
  try {
    return { result: await run(), gits };
  } finally {
    Reflect.set(childProcess, 'spawn', spawn);
  }
}

suite('Repository files', function () {
  this.timeout(20_000);
  let parent: string;
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    parent = tempFolder('files');
    repository = await tempRepository(path.join(parent, 'repository'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(parent));

  test('lists the files at a commit and in the working tree', async () => {
    assert.deepStrictEqual(await listTree(gitPath, cwd, 'HEAD'), [
      'src/tracked.txt',
    ]);
    assert.deepStrictEqual(
      (await listTree(gitPath, cwd, undefined)).toSorted(),
      ['src/tracked.txt', 'untracked.txt'],
    );
  });

  test('shows a file with a NUL byte as binary, unless it comes late', async () => {
    fs.writeFileSync(
      path.join(cwd, 'bin.dat'),
      Buffer.from([0x89, 0x50, 0, 1]),
    );
    fs.writeFileSync(path.join(cwd, 'late.txt'), `${'x'.repeat(9000)}\0`);
    await repository.git('add', 'bin.dat', 'late.txt');
    await repository.git('commit', '-m', 'binary');
    try {
      const [object] = await repository.resolve('HEAD:bin.dat');
      assert.deepStrictEqual(await readFile(gitPath, cwd, 'HEAD', 'bin.dat'), {
        content: '',
        binary: true,
        id: object,
      });
      const { size, mtimeMs } = fs.statSync(path.join(cwd, 'bin.dat'));
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'bin.dat'),
        {
          content: '',
          binary: true,
          id: `${size}-${mtimeMs}`,
        },
      );
      for (const hash of ['HEAD', undefined]) {
        assert.strictEqual(
          (await readFile(gitPath, cwd, hash, 'late.txt')).binary,
          false,
        );
      }
    } finally {
      await repository.git('reset', 'HEAD~1');
      fs.rmSync(path.join(cwd, 'bin.dat'));
      fs.rmSync(path.join(cwd, 'late.txt'));
    }
  });

  test('reads a file at a commit and in the working tree', async () => {
    const committed = await readFile(gitPath, cwd, 'HEAD', 'src/tracked.txt');
    assert.deepStrictEqual(committed, { content: 'one\n', binary: false });
    const current = await readFile(gitPath, cwd, undefined, 'src/tracked.txt');
    assert.strictEqual(current.content, 'two\n');
    await assert.rejects(
      readFile(gitPath, cwd, 'HEAD', 'missing.txt'),
      /missing.txt is not in HEAD/,
    );
  });

  test('reads a file at a commit with one git', async () => {
    assert.deepStrictEqual(
      await gitsStarted(() =>
        readFile(gitPath, cwd, 'HEAD', 'src/tracked.txt'),
      ),
      { result: { content: 'one\n', binary: false }, gits: 1 },
    );
  });

  test('reads a file deleted since it was listed as empty', async () => {
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'gone.txt'),
      {
        content: '',
        binary: false,
      },
    );
  });

  test('reads no file outside the repository', async () => {
    const outside = path.join(parent, 'outside.txt');
    fs.writeFileSync(outside, 'secret\n');
    try {
      await assert.rejects(
        readFile(gitPath, cwd, undefined, '../outside.txt'),
        /outside the repository/,
      );
      await assert.rejects(
        readFile(gitPath, cwd, undefined, outside),
        /outside the repository/,
      );
    } finally {
      fs.rmSync(outside);
    }
    const dots = path.join(cwd, '..dots.txt');
    fs.writeFileSync(dots, 'inside\n');
    try {
      assert.strictEqual(
        (await readFile(gitPath, cwd, undefined, '..dots.txt')).content,
        'inside\n',
      );
    } finally {
      fs.rmSync(dots);
    }
  });

  test('reads a file whose folder became a file as empty', async () => {
    const folder = path.join(cwd, 'gone-dir');
    fs.writeFileSync(folder, '');
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'gone-dir/f.txt'),
        { content: '', binary: false },
      );
    } finally {
      fs.rmSync(folder);
    }
  });

  test('reads a symlink in the working tree by its target, as git does', async function () {
    const link = path.join(cwd, 'link');
    symlinkOrSkip(this, 'src/tracked.txt', link);
    try {
      assert.deepStrictEqual(await readFile(gitPath, cwd, undefined, 'link'), {
        content: 'src/tracked.txt',
        binary: false,
      });
    } finally {
      fs.rmSync(link);
    }
  });
});

suite('Large files and submodules', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let inner: string;

  suiteSetup(async () => {
    let repository: TempRepository;
    ({ repository, inner } = await submoduleRepository('large', {
      'large.txt': 'x'.repeat(3 * 1024 * 1024),
    }));
    gitPath = repository.gitPath;
    cwd = repository.root;
  });

  suiteTeardown(() => removeFolder(cwd));

  test('shows a file too large to show as binary', async () => {
    for (const hash of ['HEAD', undefined]) {
      const { content, binary, id } = await readFile(
        gitPath,
        cwd,
        hash,
        'large.txt',
      );
      assert.deepStrictEqual(
        { content, binary },
        { content: '', binary: true },
      );
      assert.ok(id);
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

suite('Blobs', function () {
  this.timeout(20_000);

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

suite('Images', function () {
  this.timeout(20_000);
  let folder: string;
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  const pixel = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);

  suiteSetup(async () => {
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

  suiteTeardown(() => removeFolder(folder));

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

  test('reads an image at a revision: a commit, its parent or the index', async () => {
    const at = (revision: string, file = 'pixel.png') =>
      readImage(
        gitPath,
        cwd,
        { path: file, id: '1', disk: false, revision },
        pixel.length,
      );
    fs.writeFileSync(path.join(cwd, 'pixel.png'), Buffer.from([0, 7]));
    await repository.git('commit', '-am', 'changed');
    fs.writeFileSync(path.join(cwd, 'pixel.png'), Buffer.from([0, 8]));
    await repository.git('add', 'pixel.png');
    try {
      const [head] = await repository.resolve('HEAD');
      assert.deepStrictEqual(await at('HEAD'), {
        kind: 'image',
        bytes: Buffer.from([0, 7]),
      });
      assert.deepStrictEqual(await at(`${head}^`), {
        kind: 'image',
        bytes: pixel,
      });
      assert.deepStrictEqual(await at(''), {
        kind: 'image',
        bytes: Buffer.from([0, 8]),
      });
      assert.deepStrictEqual(await at('HEAD', 'huge.png'), {
        kind: 'tooLarge',
      });
      for (const missing of ['gone.png', '']) {
        assert.deepStrictEqual(await at('HEAD', missing || '.'), {
          kind: 'missing',
        });
      }
    } finally {
      await repository.git('reset', '--hard', 'HEAD~1');
    }
  });

  test('reads an image with one git, by its object id or at a revision', async () => {
    const [object] = await repository.resolve('HEAD:pixel.png');
    for (const source of [
      { path: 'pixel.png', id: object, disk: false },
      { path: 'pixel.png', id: '1', disk: false, revision: 'HEAD' },
      { path: 'huge.png', id: '1', disk: false, revision: 'HEAD' },
    ]) {
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
});
