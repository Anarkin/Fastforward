import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { writeOver } from './fixtures';
import { removeFolder, tempFolder } from './tempFolders';

suite('A file written over', () => {
  let folder: string;

  beforeAll(() => {
    folder = tempFolder('written-over');
  });

  afterAll(() => {
    removeFolder(folder);
  });

  test('gets its new text in place of the old, byte for byte, as the same file', () => {
    const file = path.join(folder, 'edited.md');
    fs.writeFileSync(file, 'Edited 1 times.\n');
    const before = fs.statSync(file).ino;
    writeOver(file, 'Edited 2 times.\n');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'Edited 2 times.\n');
    assert.strictEqual(fs.statSync(file).ino, before);
  });

  test('is refused a text of another length, which only cutting the file first could write, leaving it empty or with the end of its old text for whoever reads it meanwhile', () => {
    const file = path.join(folder, 'longer.md');
    fs.writeFileSync(file, 'Edited 9 times.\n');
    assert.throws(
      () => writeOver(file, 'Edited 10 times.\n'),
      /holds 16 bytes, so 17 can't be written over them/,
    );
    assert.throws(
      () => writeOver(file, 'Edited.\n'),
      /holds 16 bytes, so 8 can't be written over them/,
    );
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'Edited 9 times.\n');
  });
});
