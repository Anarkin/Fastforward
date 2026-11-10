import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  runTransfer,
  type ClashReply,
  type TransferOptions,
  type TransferPlan,
} from '../../../../tools/commander/main/transfer';
import type {
  Clash,
  TransferProgress,
} from '../../../../tools/commander/shared/transfers';
import { strings } from '../../../../shared/strings';
import { removeFolder, tempFolder } from '../../../repositories';

let folder: string;
let source: string;
let target: string;

beforeEach(() => {
  folder = tempFolder('transfer');
  source = path.join(folder, 'source');
  target = path.join(folder, 'target');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
});

afterEach(() => removeFolder(folder));

const past = new Date('2020-02-03T04:05:06Z');

function write(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, past, past);
  return file;
}

function hide(file: string): void {
  if (process.platform === 'win32') {
    execFileSync('attrib', ['+h', file]);
  }
}

function tree(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const name of fs.readdirSync(root, {
    recursive: true,
    encoding: 'utf8',
  })) {
    const each = path.join(root, name);
    const key = name.replaceAll('\\', '/');
    found[key] = fs.lstatSync(each).isDirectory()
      ? '/'
      : fs.readFileSync(each, 'utf8');
  }
  return found;
}

async function run(
  plan: TransferPlan,
  {
    answers = [],
    ...options
  }: Partial<TransferOptions> & { answers?: ClashReply[] } = {},
) {
  const clashes: Clash[] = [];
  const failures: string[] = [];
  const progress: TransferProgress[] = [];
  const end = await runTransfer(
    plan,
    {
      progress: (each) => progress.push(each),
      clash: (clash) => {
        clashes.push(clash);
        return Promise.resolve(
          answers.shift() ?? { answer: 'stop', all: false },
        );
      },
      failed: (name, reason) => failures.push(`${name}: ${reason}`),
    },
    { stopped: () => false, ...options },
  );
  return { end, clashes, failures, progress };
}

const crossingDrives = (from: string, to: string) =>
  Promise.reject(
    Object.assign(new Error(`EXDEV: cross-device link, ${from} -> ${to}`), {
      code: 'EXDEV',
    }),
  );

suite('Transfer', () => {
  test('copies files and folders into the target with their contents and modification times, leaving the sources, and tells how many files and bytes it copied of how many', async () => {
    write(path.join(source, 'a.txt'), 'aaa');
    write(path.join(source, 'docs', 'b.txt'), 'bb');
    write(path.join(source, 'docs', 'deeper', 'c.txt'), 'c');
    fs.mkdirSync(path.join(source, 'docs', 'empty'));
    fs.utimesSync(path.join(source, 'docs'), past, past);

    const { end, failures, progress } = await run({
      sources: [path.join(source, 'a.txt'), path.join(source, 'docs')],
      target,
      move: false,
    });

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(tree(target), {
      'a.txt': 'aaa',
      docs: '/',
      'docs/b.txt': 'bb',
      'docs/deeper': '/',
      'docs/deeper/c.txt': 'c',
      'docs/empty': '/',
    });
    assert.deepStrictEqual(Object.keys(tree(source)).length, 6);
    for (const name of [
      'a.txt',
      path.join('docs', 'deeper', 'c.txt'),
      'docs',
    ]) {
      assert.strictEqual(
        Math.floor(fs.statSync(path.join(target, name)).mtimeMs / 1000),
        past.getTime() / 1000,
        name,
      );
    }
    const last = progress.at(-1);
    assert.deepStrictEqual(
      last && {
        files: last.files,
        totalFiles: last.totalFiles,
        bytes: last.bytes,
        totalBytes: last.totalBytes,
      },
      { files: 3, totalFiles: 3, bytes: 6, totalBytes: 6 },
    );
  });

  test('moves items on the same drive by renaming them, whole folders at once, leaving nothing in the source', async () => {
    write(path.join(source, 'a.txt'), 'a');
    write(path.join(source, 'docs', 'b.txt'), 'b');
    const renamed: string[] = [];

    const { end, failures } = await run(
      {
        sources: [path.join(source, 'a.txt'), path.join(source, 'docs')],
        target,
        move: true,
      },
      {
        rename: (from, to) => {
          renamed.push(path.relative(folder, from));
          return fs.promises.rename(from, to);
        },
      },
    );

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(renamed, [
      path.join('source', 'a.txt'),
      path.join('source', 'docs'),
    ]);
    assert.deepStrictEqual(tree(target), {
      'a.txt': 'a',
      docs: '/',
      'docs/b.txt': 'b',
    });
    assert.deepStrictEqual(tree(source), {});
  });

  test('moves items to another drive by copying each file and deleting it once copied, then the folders emptied', async () => {
    write(path.join(source, 'a.txt'), 'a');
    write(path.join(source, 'docs', 'b.txt'), 'b');
    write(path.join(source, 'docs', 'deeper', 'c.txt'), 'c');

    const { end, failures, progress } = await run(
      {
        sources: [path.join(source, 'a.txt'), path.join(source, 'docs')],
        target,
        move: true,
      },
      { rename: crossingDrives },
    );

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(tree(target), {
      'a.txt': 'a',
      docs: '/',
      'docs/b.txt': 'b',
      'docs/deeper': '/',
      'docs/deeper/c.txt': 'c',
    });
    assert.deepStrictEqual(tree(source), {});
    assert.strictEqual(progress.at(-1)?.files, 3);
  });

  test('merges a folder into one of the same name, asking only about the files there already, and moves out of it only what it was not told to skip', async () => {
    write(path.join(source, 'docs', 'new.txt'), 'new');
    write(path.join(source, 'docs', 'same.txt'), 'source');
    write(path.join(target, 'docs', 'same.txt'), 'target, longer');
    write(path.join(target, 'docs', 'kept.txt'), 'kept');

    const { end, clashes } = await run(
      { sources: [path.join(source, 'docs')], target, move: true },
      { answers: [{ answer: 'skip', all: false }] },
    );

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(
      clashes.map((clash) => ({
        name: clash.name,
        source: clash.source.size,
        target: clash.target.size,
        modified: clash.source.modified === past.getTime(),
      })),
      [
        {
          name: path.join('docs', 'same.txt'),
          source: 6,
          target: 14,
          modified: true,
        },
      ],
    );
    assert.deepStrictEqual(tree(target), {
      docs: '/',
      'docs/kept.txt': 'kept',
      'docs/new.txt': 'new',
      'docs/same.txt': 'target, longer',
    });
    assert.deepStrictEqual(tree(source), {
      docs: '/',
      'docs/same.txt': 'source',
    });
  });

  test('overwrites a file there already, skips it or keeps both under the first free name as answered, and answers the rest alike once told to', async () => {
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', '.env']) {
      write(path.join(source, name), `new ${name}`);
      write(path.join(target, name), `old ${name}`);
    }
    write(path.join(target, 'c (2).txt'), 'taken');

    const { end, clashes } = await run(
      {
        sources: ['a.txt', 'b.txt', 'c.txt', '.env', 'd.txt', 'e.txt'].map(
          (name) => path.join(source, name),
        ),
        target,
        move: false,
      },
      {
        answers: [
          { answer: 'overwrite', all: false },
          { answer: 'skip', all: false },
          { answer: 'keepBoth', all: false },
          { answer: 'keepBoth', all: true },
        ],
      },
    );

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(
      clashes.map((clash) => clash.name),
      ['a.txt', 'b.txt', 'c.txt', '.env'],
    );
    assert.deepStrictEqual(tree(target), {
      '.env': 'old .env',
      '.env (2)': 'new .env',
      'a.txt': 'new a.txt',
      'b.txt': 'old b.txt',
      'c (2).txt': 'taken',
      'c (3).txt': 'new c.txt',
      'c.txt': 'old c.txt',
      'd (2).txt': 'new d.txt',
      'd.txt': 'old d.txt',
      'e (2).txt': 'new e.txt',
      'e.txt': 'old e.txt',
    });
  });

  test('says a file there already is read-only when it asks, and overwrites it when told to, by copying and by moving, as asking to overwrite it is enough', async () => {
    for (const name of ['copied.txt', 'moved.txt', 'writable.txt']) {
      write(path.join(source, name), `new ${name}`);
      write(path.join(target, name), `old ${name}`);
    }
    for (const name of ['copied.txt', 'moved.txt']) {
      fs.chmodSync(path.join(target, name), 0o444);
    }

    const copied = await run(
      {
        sources: ['copied.txt', 'writable.txt'].map((name) =>
          path.join(source, name),
        ),
        target,
        move: false,
      },
      { answers: [{ answer: 'overwrite', all: true }] },
    );
    const moved = await run(
      { sources: [path.join(source, 'moved.txt')], target, move: true },
      { answers: [{ answer: 'overwrite', all: false }] },
    );

    assert.deepStrictEqual(
      [...copied.clashes, ...moved.clashes].map((clash) => [
        clash.name,
        clash.target.readOnly === true,
      ]),
      [
        ['copied.txt', true],
        ['moved.txt', true],
      ],
    );
    assert.deepStrictEqual([...copied.failures, ...moved.failures], []);
    assert.deepStrictEqual(tree(target), {
      'copied.txt': 'new copied.txt',
      'moved.txt': 'new moved.txt',
      'writable.txt': 'new writable.txt',
    });
  });

  test('refuses to copy or move an item onto itself, reached through a link to its folder or as a hard link of it, without asking, keeping its bytes', async () => {
    write(path.join(source, 'big.bin'), 'b'.repeat(10_000));
    write(path.join(source, 'docs', 'note.txt'), 'note');
    write(path.join(source, 'twin.bin'), 't'.repeat(10_000));
    fs.linkSync(path.join(source, 'twin.bin'), path.join(target, 'twin.bin'));
    const linked = path.join(folder, 'linked');
    fs.symlinkSync(source, linked, 'junction');
    const pieces = { piecesFrom: 4000, pieceBytes: 1000, cloning: false };

    const copied = await run(
      {
        sources: [path.join(source, 'big.bin'), path.join(source, 'docs')],
        target: linked,
        move: false,
      },
      pieces,
    );
    const moved = await run(
      { sources: [path.join(source, 'big.bin')], target: linked, move: true },
      { ...pieces, rename: crossingDrives },
    );
    const twin = await run(
      { sources: [path.join(source, 'twin.bin')], target, move: true },
      { ...pieces, rename: crossingDrives },
    );

    assert.deepStrictEqual(
      [...copied.clashes, ...moved.clashes, ...twin.clashes],
      [],
    );
    assert.deepStrictEqual(
      [...copied.failures, ...moved.failures, ...twin.failures],
      [
        `big.bin: ${strings.commander.itselfThere}`,
        `docs: ${strings.commander.itselfThere}`,
        `big.bin: ${strings.commander.itselfThere}`,
        `twin.bin: ${strings.commander.itselfThere}`,
      ],
    );
    assert.deepStrictEqual(tree(source), {
      'big.bin': 'b'.repeat(10_000),
      docs: '/',
      'docs/note.txt': 'note',
      'twin.bin': 't'.repeat(10_000),
    });
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'twin.bin'), 'utf8'),
      't'.repeat(10_000),
    );
  });

  test('overwrites a hidden file there already, and keeps a file it was told to overwrite as it was until its copy is whole, once stopped too', async () => {
    write(path.join(source, 'desktop.ini'), 'new desktop.ini');
    write(path.join(source, 'big.bin'), 'n'.repeat(10_000));
    for (const name of ['desktop.ini', 'big.bin']) {
      write(path.join(target, name), `old ${name}`);
      hide(path.join(target, name));
    }
    const pieces = { piecesFrom: 4000, pieceBytes: 1000, cloning: false };
    let asked = 0;

    const stopped = await run(
      { sources: [path.join(source, 'big.bin')], target, move: false },
      {
        ...pieces,
        answers: [{ answer: 'overwrite', all: false }],
        stopped: () => ++asked > 4,
      },
    );

    assert.strictEqual(stopped.end, 'stopped');
    assert.deepStrictEqual(tree(target), {
      'big.bin': 'old big.bin',
      'desktop.ini': 'old desktop.ini',
    });

    const overwritten = await run(
      {
        sources: ['desktop.ini', 'big.bin'].map((name) =>
          path.join(source, name),
        ),
        target,
        move: false,
      },
      { ...pieces, answers: [{ answer: 'overwrite', all: true }] },
    );

    assert.strictEqual(overwritten.end, 'done');
    assert.deepStrictEqual(overwritten.failures, []);
    assert.deepStrictEqual(tree(target), {
      'big.bin': 'n'.repeat(10_000),
      'desktop.ini': 'new desktop.ini',
    });
  });

  test('stops when told to at a question, leaving what it did not reach in place', async () => {
    write(path.join(source, 'a.txt'), 'new a');
    write(path.join(target, 'a.txt'), 'old a');
    write(path.join(source, 'b.txt'), 'b');

    const { end } = await run(
      {
        sources: [path.join(source, 'a.txt'), path.join(source, 'b.txt')],
        target,
        move: false,
      },
      { answers: [{ answer: 'stop', all: false }] },
    );

    assert.strictEqual(end, 'stopped');
    assert.deepStrictEqual(tree(target), { 'a.txt': 'old a' });
    assert.deepStrictEqual(tree(source), { 'a.txt': 'new a', 'b.txt': 'b' });
  });

  test('says which items it could not copy and why, a file where a folder of its name is or the other way round, or one gone, and goes on with the rest', async () => {
    write(path.join(source, 'docs'), 'a file');
    write(path.join(source, 'notes', 'n.txt'), 'n');
    fs.mkdirSync(path.join(target, 'docs'));
    write(path.join(target, 'notes'), 'a file');
    write(path.join(source, 'fine.txt'), 'fine');

    const { end, failures, progress } = await run({
      sources: ['docs', 'notes', 'gone.txt', 'fine.txt'].map((name) =>
        path.join(source, name),
      ),
      target,
      move: false,
    });

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(failures, [
      `docs: ${strings.commander.folderThere}`,
      `notes: ${strings.commander.fileThere}`,
      `gone.txt: ${strings.commander.gone}`,
    ]);
    assert.deepStrictEqual(tree(target), {
      docs: '/',
      'fine.txt': 'fine',
      notes: 'a file',
    });
    const last = progress.at(-1);
    assert.strictEqual(last?.files, last?.totalFiles);
  });

  test('copies a large file in pieces, telling of the bytes copied as it goes, and once stopped removes the part copied, leaving the source of a move', async () => {
    const big = path.join(source, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(10_000, 7));
    fs.utimesSync(big, past, past);
    const pieces = {
      piecesFrom: 4000,
      pieceBytes: 1000,
      cloning: false,
      progressEvery: 0,
    };

    const copied = await run({ sources: [big], target, move: false }, pieces);

    assert.strictEqual(copied.end, 'done');
    assert.deepStrictEqual(
      fs.readFileSync(path.join(target, 'big.bin')),
      Buffer.alloc(10_000, 7),
    );
    assert.strictEqual(
      Math.floor(fs.statSync(path.join(target, 'big.bin')).mtimeMs / 1000),
      past.getTime() / 1000,
    );
    assert.ok(
      copied.progress.some(
        (each) => each.files === 0 && each.bytes > 0 && each.bytes < 10_000,
      ),
    );
    fs.rmSync(path.join(target, 'big.bin'));

    let asked = 0;
    const stopped = await run(
      { sources: [big], target, move: true },
      { ...pieces, rename: crossingDrives, stopped: () => ++asked > 4 },
    );

    assert.strictEqual(stopped.end, 'stopped');
    assert.deepStrictEqual(fs.readdirSync(target), []);
    assert.strictEqual(fs.statSync(big).size, 10_000);
  });

  test('copies a symbolic link as a link, and moves it so to another drive', async (context) => {
    write(path.join(source, 'real.txt'), 'real');
    try {
      fs.symlinkSync('real.txt', path.join(source, 'link.txt'), 'file');
    } catch {
      context.skip();
    }

    await run({
      sources: [path.join(source, 'link.txt')],
      target,
      move: false,
    });
    assert.strictEqual(
      fs.readlinkSync(path.join(target, 'link.txt')),
      'real.txt',
    );
    fs.rmSync(path.join(target, 'link.txt'));

    await run(
      { sources: [path.join(source, 'link.txt')], target, move: true },
      { rename: crossingDrives },
    );
    assert.strictEqual(
      fs.readlinkSync(path.join(target, 'link.txt')),
      'real.txt',
    );
    assert.deepStrictEqual(fs.readdirSync(source), ['real.txt']);
  });

  test('copies a junction as a link to the same folder, also on Windows without the right to make symbolic links, as pnpm makes its packages of them', async () => {
    write(path.join(source, 'real', 'index.js'), 'index');
    fs.symlinkSync(
      path.join(source, 'real'),
      path.join(source, 'package'),
      'junction',
    );

    const { failures } = await run({
      sources: [path.join(source, 'package')],
      target,
      move: false,
    });

    assert.deepStrictEqual(failures, []);
    assert.ok(fs.lstatSync(path.join(target, 'package')).isSymbolicLink());
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'package', 'index.js'), 'utf8'),
      'index',
    );
  });

  test('copies files of several folders into the one target, as a flat view lists them, asking about the second of one name', async () => {
    write(path.join(source, 'one', 'photo.jpg'), 'one');
    write(path.join(source, 'two', 'photo.jpg'), 'two');
    write(path.join(source, 'two', 'other.jpg'), 'other');

    const { clashes } = await run(
      {
        sources: [
          path.join(source, 'one', 'photo.jpg'),
          path.join(source, 'two', 'photo.jpg'),
          path.join(source, 'two', 'other.jpg'),
        ],
        target,
        move: false,
      },
      { answers: [{ answer: 'keepBoth', all: false }] },
    );

    assert.deepStrictEqual(
      clashes.map((clash) => clash.name),
      ['photo.jpg'],
    );
    assert.deepStrictEqual(tree(target), {
      'other.jpg': 'other',
      'photo (2).jpg': 'two',
      'photo.jpg': 'one',
    });
  });

  test('tells of its progress at most once in each interval, then of where it ended, naming the file it is at', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      write(path.join(source, `${name}.txt`), name);
    }
    let now = 0;

    const { progress } = await run(
      {
        sources: ['a', 'b', 'c', 'd', 'e'].map((name) =>
          path.join(source, `${name}.txt`),
        ),
        target,
        move: false,
      },
      {
        now: () => {
          now += 40;
          return now;
        },
        progressEvery: 100,
      },
    );

    assert.ok(progress.length < 5, `${progress.length} reports`);
    assert.deepStrictEqual(progress.at(-1), {
      files: 5,
      totalFiles: 5,
      bytes: 5,
      totalBytes: 5,
      current: 'e.txt',
    });
  });
});
