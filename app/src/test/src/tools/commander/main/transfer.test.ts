import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import {
  crossingDrives,
  hide,
  past,
  run,
  tree,
  write,
} from './transferFixtures';
import type { ClashReply } from '../../../../../tools/commander/main/transfer';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

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

afterEach(() => {
  vi.restoreAllMocks();
  removeFolder(folder);
});

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

  test('copies the one item of a plan under the name it gives, a folder with its contents, beside itself too', async () => {
    write(path.join(source, 'a.txt'), 'a');
    write(path.join(source, 'docs', 'note.txt'), 'note');

    const file = await run({
      sources: [path.join(source, 'a.txt')],
      target: source,
      move: false,
      as: 'a copy.txt',
    });
    const folderCopied = await run({
      sources: [path.join(source, 'docs')],
      target,
      move: false,
      as: 'notes',
    });

    assert.deepStrictEqual(
      [file.end, folderCopied.end, file.clashes, folderCopied.clashes],
      ['done', 'done', [], []],
    );
    assert.deepStrictEqual(tree(source), {
      'a copy.txt': 'a',
      'a.txt': 'a',
      docs: '/',
      'docs/note.txt': 'note',
    });
    assert.deepStrictEqual(tree(target), {
      notes: '/',
      'notes/note.txt': 'note',
    });
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

  test('keeps a read-only file it was told to overwrite read-only when its copy is stopped, as it is left as it was', async () => {
    write(path.join(source, 'big.bin'), 'n'.repeat(10_000));
    const kept = path.join(target, 'big.bin');
    write(kept, 'old big.bin');
    fs.chmodSync(kept, 0o444);
    let asked = 0;

    const stopped = await run(
      { sources: [path.join(source, 'big.bin')], target, move: false },
      {
        piecesFrom: 4000,
        pieceBytes: 1000,
        cloning: false,
        answers: [{ answer: 'overwrite', all: false }],
        stopped: () => ++asked > 4,
      },
    );

    assert.strictEqual(stopped.end, 'stopped');
    assert.strictEqual(fs.readFileSync(kept, 'utf8'), 'old big.bin');
    assert.strictEqual(fs.statSync(kept).mode & 0o222, 0);
    fs.chmodSync(kept, 0o644);
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

  test.skipIf(process.platform !== 'win32')(
    'keeps the Mark of the Web of a large file copied in pieces on Windows, as a downloaded installer moved to another drive lost it, and its original was deleted',
    async () => {
      const big = path.join(source, 'setup.exe');
      fs.writeFileSync(big, Buffer.alloc(10_000, 7));
      const mark = '[ZoneTransfer]\r\nZoneId=3\r\n';
      fs.writeFileSync(`${big}:Zone.Identifier`, mark);

      const moved = await run(
        { sources: [big], target, move: true },
        {
          piecesFrom: 4000,
          pieceBytes: 1000,
          cloning: false,
          rename: crossingDrives,
        },
      );

      assert.deepStrictEqual(moved.failures, []);
      assert.strictEqual(
        fs.readFileSync(path.join(target, 'setup.exe:Zone.Identifier'), 'utf8'),
        mark,
      );
    },
  );

  test.skipIf(process.platform !== 'win32')(
    'keeps the Mark of the Web of a large read-only file copied in pieces on Windows, and keeps it read-only, as the target was made read-only before its mark was written, which Windows refused',
    async () => {
      const big = path.join(source, 'setup.iso');
      fs.writeFileSync(big, Buffer.alloc(10_000, 7));
      const mark = '[ZoneTransfer]\r\nZoneId=3\r\n';
      fs.writeFileSync(`${big}:Zone.Identifier`, mark);
      fs.chmodSync(big, 0o444);

      try {
        const copied = await run(
          { sources: [big], target, move: false },
          { piecesFrom: 4000, pieceBytes: 1000, cloning: false },
        );

        assert.deepStrictEqual(copied.failures, []);
        const made = path.join(target, 'setup.iso');
        assert.strictEqual(
          fs.readFileSync(`${made}:Zone.Identifier`, 'utf8'),
          mark,
        );
        assert.strictEqual(fs.statSync(made).mode & 0o222, 0);
      } finally {
        fs.chmodSync(big, 0o666);
        if (fs.existsSync(path.join(target, 'setup.iso'))) {
          fs.chmodSync(path.join(target, 'setup.iso'), 0o666);
        }
      }
    },
  );

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

  test('overwrites a file with a link only once the link is made, keeping the file when it cannot be', async () => {
    write(path.join(source, 'real', 'index.js'), 'index');
    fs.symlinkSync(
      path.join(source, 'real'),
      path.join(source, 'package'),
      'junction',
    );
    write(path.join(target, 'package'), 'old');
    const plan = {
      sources: [path.join(source, 'package')],
      target,
      move: false,
    };
    const overwrite: ClashReply = { answer: 'overwrite', all: false };
    const refused = vi.spyOn(fs.promises, 'symlink').mockRejectedValue(
      Object.assign(new Error('EPERM: operation not permitted'), {
        code: 'EPERM',
      }),
    );

    const failed = await run(plan, { answers: [overwrite] });
    assert.strictEqual(failed.failures.length, 1);
    assert.deepStrictEqual(tree(target), { package: 'old' });

    refused.mockRestore();
    const { failures } = await run(plan, { answers: [overwrite] });
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(fs.readdirSync(target), ['package']);
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'package', 'index.js'), 'utf8'),
      'index',
    );
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

  test('tells of its progress at most once in each interval, then of where it ended, naming the file it is at by its whole path', async () => {
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
      current: path.join(source, 'e.txt'),
    });
  });
});
