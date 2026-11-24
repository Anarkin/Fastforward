import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { runDeletion } from '../../../../../tools/commander/main/deletion';
import type { TransferProgress } from '../../../../../tools/commander/shared/transfers';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

let folder: string;

beforeEach(() => {
  folder = tempFolder('deletion');
});

afterEach(() => {
  removeFolder(folder);
});

const at = (...parts: string[]) => path.join(folder, ...parts);

function write(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const left = () =>
  fs
    .readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/'))
    .toSorted();

suite('Deleting permanently', () => {
  test('deletes the items whole, folders, read-only files and all, counting every file and its bytes first and telling how far it got', async () => {
    write(at('docs', 'a.txt'), 'aaa');
    write(at('docs', 'deeper', 'b.txt'), 'bb');
    fs.mkdirSync(at('docs', 'empty'));
    fs.chmodSync(write(at('locked.txt'), 'c'), 0o444);
    write(at('kept.txt'), 'kept');
    const progress: TransferProgress[] = [];
    const failures: string[] = [];

    const end = await runDeletion(
      [at('docs'), at('locked.txt')],
      {
        progress: (each) => progress.push(each),
        failed: (name, reason) => failures.push(`${name}: ${reason}`),
      },
      { stopped: () => false, progressEvery: 0 },
    );

    assert.strictEqual(end, 'done');
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(left(), ['kept.txt']);
    assert.deepStrictEqual(progress[0], {
      files: 0,
      totalFiles: 3,
      bytes: 0,
      totalBytes: 6,
    });
    assert.deepStrictEqual(progress.at(-1), {
      files: 3,
      totalFiles: 3,
      bytes: 6,
      totalBytes: 6,
    });
    assert.ok(
      progress.some(({ current }) => current === at('docs', 'a.txt')),
      JSON.stringify(progress),
    );
  });

  test('stops between files once asked, leaving what it has not reached and the folders still holding it', async () => {
    write(at('docs', 'a.txt'), 'a');
    write(at('docs', 'b.txt'), 'b');
    write(at('docs', 'c.txt'), 'c');
    const texts = () => left().filter((name) => name.endsWith('.txt'));

    const end = await runDeletion(
      [at('docs')],
      { progress: () => undefined, failed: () => undefined },
      { stopped: () => texts().length < 3, progressEvery: 0 },
    );

    assert.strictEqual(end, 'stopped');
    assert.strictEqual(texts().length, 2);
    assert.ok(left().includes('docs'));
  });
});
