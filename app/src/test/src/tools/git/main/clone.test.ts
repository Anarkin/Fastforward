import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  cloningFolder,
  placeClone,
  progressOf,
  progressReader,
} from '../../../../../tools/git/main/clone';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import type { CloneProgress } from '../../../../../tools/git/shared/clone';

suite('Clone progress', () => {
  test("reads the phase, percent and what git says beside them from git's progress lines, from the remote's too", () => {
    assert.deepStrictEqual(
      progressOf('Receiving objects:  45% (450/1000), 1.20 MiB | 600.00 KiB/s'),
      {
        phase: 'Receiving objects',
        percent: 45,
        detail: '1.20 MiB | 600.00 KiB/s',
      },
    );
    assert.deepStrictEqual(
      progressOf(
        'Receiving objects: 100% (1000/1000), 2.50 MiB | 1.20 MiB/s, done.',
      ),
      {
        phase: 'Receiving objects',
        percent: 100,
        detail: '2.50 MiB | 1.20 MiB/s',
      },
    );
    assert.deepStrictEqual(progressOf('Resolving deltas:  30% (30/100)'), {
      phase: 'Resolving deltas',
      percent: 30,
    });
    assert.deepStrictEqual(
      progressOf('remote: Compressing objects: 100% (5/5), done.'),
      { phase: 'Compressing objects', percent: 100 },
    );
  });

  test('reads nothing from lines without a percent', () => {
    for (const line of [
      '',
      "Cloning into 'app'...",
      'remote: Enumerating objects: 10, done.',
      'fatal: repository not found',
    ]) {
      assert.strictEqual(progressOf(line), undefined, line);
    }
  });

  test('reads the lines git ends with a carriage return or a newline, however the output is cut, keeping a character split between chunks', () => {
    const read: CloneProgress[] = [];
    const take = progressReader((progress) => read.push(progress));
    const output = Buffer.from(
      "Cloning into 'app'...\nReceiéving objects:  10% (1/10)\rReceiving objects:  20% (2/10)\rUpdating files: 100% (3/3), done.\n",
    );
    const split = output.indexOf(0xa9);
    take(output.subarray(0, split));
    take(output.subarray(split, split + 30));
    take(output.subarray(split + 30));
    assert.deepStrictEqual(read, [
      { phase: 'Receiéving objects', percent: 10 },
      { phase: 'Receiving objects', percent: 20 },
      { phase: 'Updating files', percent: 100 },
    ]);
  });
});

suite('Putting a clone in place', () => {
  test('puts the folder cloned into where the clone was to go, in place of an empty folder too', async () => {
    const folder = tempFolder('placing-clone');
    try {
      for (const [name, emptyThere] of [
        ['missing', false],
        ['empty', true],
      ] as const) {
        const target = path.join(folder, name);
        if (emptyThere) {
          fs.mkdirSync(target);
        }
        const cloned = cloningFolder(target);
        fs.mkdirSync(path.join(cloned, '.git'), { recursive: true });
        assert.strictEqual(await placeClone(cloned, target), true);
        assert.deepStrictEqual(fs.readdirSync(target), ['.git']);
        assert.strictEqual(fs.existsSync(cloned), false);
      }
    } finally {
      removeFolder(folder);
    }
  });

  test('leaves the clone where it was made once something took its place meanwhile, as putting it there would delete what was put there', async () => {
    const folder = tempFolder('placing-clone-taken');
    try {
      const target = path.join(folder, 'app');
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, 'kept.txt'), 'kept');
      const cloned = cloningFolder(target);
      fs.mkdirSync(path.join(cloned, '.git'), { recursive: true });
      assert.strictEqual(await placeClone(cloned, target), false);
      assert.deepStrictEqual(fs.readdirSync(target), ['kept.txt']);
      assert.deepStrictEqual(fs.readdirSync(cloned), ['.git']);
    } finally {
      removeFolder(folder);
    }
  });

  test('leaves the clone where it was made once a file took its place meanwhile, as Windows renames a folder over a file and deleted it', async () => {
    const folder = tempFolder('placing-clone-file');
    try {
      const target = path.join(folder, 'app');
      fs.writeFileSync(target, 'a file of that name');
      const cloned = cloningFolder(target);
      fs.mkdirSync(path.join(cloned, '.git'), { recursive: true });
      assert.strictEqual(await placeClone(cloned, target), false);
      assert.strictEqual(
        fs.readFileSync(target, 'utf8'),
        'a file of that name',
      );
      assert.deepStrictEqual(fs.readdirSync(cloned), ['.git']);
    } finally {
      removeFolder(folder);
    }
  });
});
