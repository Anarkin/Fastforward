import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { renameUnlessTaken } from '../../../../tools/commander/main/renaming';
import { removeFolder, tempFolder } from '../../../repositories';

suite('renameUnlessTaken', () => {
  let folder: string;
  const at = (name: string) => path.join(folder, name);
  const listed = () =>
    fs
      .readdirSync(folder)
      .toSorted((one, other) => one.localeCompare(other, 'en'));

  beforeEach(() => {
    folder = tempFolder('renaming');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('renames a file and a folder, and a name to itself in another case, as the folder lists it after', async () => {
    fs.writeFileSync(at('a.txt'), 'a');
    fs.mkdirSync(at('docs'));
    await renameUnlessTaken(at('a.txt'), at('b.txt'));
    await renameUnlessTaken(at('docs'), at('notes'));
    await renameUnlessTaken(at('b.txt'), at('B.txt'));
    assert.deepStrictEqual(listed(), ['B.txt', 'notes']);
  });

  test('refuses a name another file or folder has rather than replacing it, as renaming does on macOS and Linux', async () => {
    fs.writeFileSync(at('a.txt'), 'a');
    fs.writeFileSync(at('b.txt'), 'b');
    fs.mkdirSync(at('docs'));
    fs.mkdirSync(at('empty'));
    await assert.rejects(renameUnlessTaken(at('a.txt'), at('b.txt')), {
      code: 'EEXIST',
    });
    await assert.rejects(renameUnlessTaken(at('docs'), at('empty')), {
      code: 'EEXIST',
    });
    assert.strictEqual(fs.readFileSync(at('b.txt'), 'utf8'), 'b');
    assert.deepStrictEqual(listed(), ['a.txt', 'b.txt', 'docs', 'empty']);
  });
});
