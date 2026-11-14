import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { readFile, readImage } from '../../../../../tools/git/main/files';
import {
  gitsStarted,
  removeFolder,
  symlinkOrSkip,
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

  test('reads the file at a commit whose name ends in a carriage return or holds a newline, not the one named without them', async () => {
    const odd = await tempRepository(tempFolder('odd-names'));
    try {
      await odd.commit('plain', { 'a.txt': 'plain\n' });
      const named = [
        ['a.txt\r', 'with a carriage return\n'],
        ['a.txt\nb', 'with a newline\n'],
      ];
      const contents = named.map((_, index) => `content-${index}`);
      named.forEach(([, content], index) =>
        fs.writeFileSync(path.join(odd.root, contents[index]), content),
      );
      const blobs = (await odd.git('hash-object', '-w', ...contents)).split(
        '\n',
      );
      await odd.git(
        '-c',
        'core.protectNTFS=false',
        'update-index',
        '--add',
        ...named.flatMap(([name], index) => [
          '--cacheinfo',
          `100644,${blobs[index]},${name}`,
        ]),
      );
      await odd.git('commit', '-q', '-m', 'odd');
      const [hash] = await odd.resolve('HEAD');
      for (const [name, content] of [...named, ['a.txt', 'plain\n']]) {
        assert.strictEqual(
          (await readFile(gitPath, odd.root, hash, name)).content,
          content,
        );
      }
    } finally {
      removeFolder(odd.root);
    }
  });

  test('reads a named pipe in the working tree as empty, rather than waiting on it', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
    }
    const fifo = path.join(cwd, 'pipe');
    const { execFileSync } = process.getBuiltinModule('node:child_process');
    execFileSync('mkfifo', [fifo]);
    try {
      assert.deepStrictEqual(await readFile(gitPath, cwd, undefined, 'pipe'), {
        content: '',
        binary: false,
      });
    } finally {
      fs.rmSync(fifo);
    }
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

  test('reads a symlink in the working tree by its target, as git does, marking it a link', async (context) => {
    const link = path.join(cwd, 'link');
    symlinkOrSkip(context, 'src/tracked.txt', link);
    try {
      assert.deepStrictEqual(await readFile(gitPath, cwd, undefined, 'link'), {
        content: 'src/tracked.txt',
        binary: false,
        link: true,
      });
    } finally {
      fs.rmSync(link);
    }
  });

  test('reads a symbolic link at a commit by its target, marking it a link, and in the working tree too where git checks it out as a plain file, as it makes no links there', async () => {
    const links = await tempRepository(path.join(parent, 'links'));
    await links.git('config', 'core.symlinks', 'false');
    await links.commit('files', {
      README: 'read me\n',
      'one-line.txt': 'README',
    });
    const content = path.join(parent, 'link-content');
    fs.writeFileSync(content, 'README');
    const [blob] = (await links.git('hash-object', '-w', content)).split('\n');
    await links.git(
      'update-index',
      '--add',
      '--cacheinfo',
      `120000,${blob},AGENTS.md`,
    );
    await links.git('commit', '-q', '-m', 'link');
    await links.git('checkout', '--', 'AGENTS.md');
    assert.ok(fs.lstatSync(path.join(links.root, 'AGENTS.md')).isFile());
    for (const hash of ['HEAD', undefined]) {
      assert.deepStrictEqual(
        await readFile(gitPath, links.root, hash, 'AGENTS.md'),
        { content: 'README', binary: false, link: true },
      );
      assert.deepStrictEqual(
        await readFile(gitPath, links.root, hash, 'one-line.txt'),
        { content: 'README', binary: false },
      );
    }
  });

  test('reads no file or image through a linked folder, as git sees none there, so a link leads nowhere outside the repository', async () => {
    const outside = path.join(parent, 'linked');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.png'), 'secret\n');
    const link = path.join(cwd, 'assets');
    fs.symlinkSync(outside, link, 'junction');
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'assets/secret.png'),
        { content: '', binary: false },
      );
      assert.deepStrictEqual(
        await readImage(gitPath, cwd, {
          path: 'assets/secret.png',
          id: 'any',
          disk: true,
        }),
        { kind: 'missing' },
      );
    } finally {
      fs.rmSync(link);
      fs.rmSync(outside, { recursive: true });
    }
  });
});
