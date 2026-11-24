import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { crossingDrives, run, tree, write } from './transferFixtures';

let folder: string;
let source: string;
let target: string;

beforeEach(() => {
  folder = tempFolder('transfer-paths');
  source = path.join(folder, 'source');
  target = path.join(folder, 'target');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeFolder(folder);
});

suite('Transfer of items reached by another path', () => {
  test('copies no folder it made into itself once it reaches it as a folder to copy by another path, as copying a folder into a folder in it through a bind mount or a share went on until the disk was full', async () => {
    write(path.join(source, 'a', 'f.txt'), 'f');
    fs.mkdirSync(path.join(source, 'a', 'inner'));
    const linked = path.join(folder, 'looping');
    fs.symlinkSync(path.join(source, 'a'), linked, 'junction');
    let asked = 0;

    const { failures } = await run(
      {
        sources: [path.join(source, 'a')],
        target: path.join(linked, 'inner'),
        move: false,
      },
      { stopped: () => ++asked > 100 },
    );

    assert.deepStrictEqual(failures, [
      `${path.join('a', 'inner', 'a')}: ${strings.commander.madeByThisCopy}`,
    ]);
    assert.deepStrictEqual(tree(path.join(source, 'a', 'inner')), {
      a: '/',
      'a/f.txt': 'f',
      'a/inner': '/',
    });
  });

  test('refuses to move an item onto itself, reached through a link to its folder or as a hard link of it, without asking, and asks about one copied onto itself as the item itself, keeping both under the first free name, a folder by its whole name, and never overwriting it, keeping its bytes', async () => {
    write(path.join(source, 'big.bin'), 'b'.repeat(10_000));
    write(path.join(source, 'docs.v1', 'note.txt'), 'note');
    write(path.join(source, 'twin.bin'), 't'.repeat(10_000));
    write(path.join(source, 'big (2).bin'), 'taken');
    fs.linkSync(path.join(source, 'twin.bin'), path.join(target, 'twin.bin'));
    const linked = path.join(folder, 'linked');
    fs.symlinkSync(source, linked, 'junction');
    const pieces = { piecesFrom: 4000, pieceBytes: 1000, cloning: false };

    const copied = await run(
      {
        sources: [
          path.join(source, 'big.bin'),
          path.join(source, 'docs.v1'),
          path.join(source, 'twin.bin'),
        ],
        target: linked,
        move: false,
      },
      {
        ...pieces,
        answers: [
          { answer: 'keepBoth', all: false },
          { answer: 'keepBoth', all: false },
          { answer: 'overwrite', all: false },
        ],
      },
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
      copied.clashes.map(({ name, itself, keptAs }) => [name, itself, keptAs]),
      [
        ['big.bin', true, 'big (3).bin'],
        ['docs.v1', true, 'docs.v1 (2)'],
        ['twin.bin', true, 'twin (2).bin'],
      ],
    );
    assert.deepStrictEqual([...moved.clashes, ...twin.clashes], []);
    assert.deepStrictEqual(
      [...copied.failures, ...moved.failures, ...twin.failures],
      [
        `twin.bin: ${strings.commander.itselfThere}`,
        `big.bin: ${strings.commander.itselfThere}`,
        `twin.bin: ${strings.commander.itselfThere}`,
      ],
    );
    assert.deepStrictEqual(tree(source), {
      'big (2).bin': 'taken',
      'big (3).bin': 'b'.repeat(10_000),
      'big.bin': 'b'.repeat(10_000),
      'docs.v1': '/',
      'docs.v1 (2)': '/',
      'docs.v1 (2)/note.txt': 'note',
      'docs.v1/note.txt': 'note',
      'twin.bin': 't'.repeat(10_000),
    });
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'twin.bin'), 'utf8'),
      't'.repeat(10_000),
    );
  });
});
