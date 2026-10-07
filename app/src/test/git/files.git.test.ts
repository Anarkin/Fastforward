import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { showPatch } from '../../git/diff';
import { listTree, maxFileSize, readBlobs, readFile } from '../../git/files';
import { parsePatch } from '../../webview/diff';
import { submoduleRepository } from '../gitFixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

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
      const binary = { content: '', binary: true };
      for (const hash of ['HEAD', undefined]) {
        assert.deepStrictEqual(
          await readFile(gitPath, cwd, hash, 'bin.dat'),
          binary,
        );
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
    const binary = { content: '', binary: true };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'large.txt'),
      binary,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'large.txt'),
      binary,
    );
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
    } finally {
      removeFolder(folder);
    }
  });
});
