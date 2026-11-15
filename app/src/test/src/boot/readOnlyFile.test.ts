import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { writeReadOnly } from '../../../boot/readOnlyFile';
import { removeFolder, tempFolder } from '../../helpers/tempFolders';

suite('Writing a file read-only', () => {
  test('writes the reference copy read-only, and can write it again', () => {
    const folder = tempFolder('copy');
    const file = path.join(folder, 'settings.defaults.json');
    try {
      writeReadOnly(file, 'first');
      assert.throws(() => fs.writeFileSync(file, 'edited'));
      writeReadOnly(file, 'second');
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'second');
    } finally {
      removeFolder(folder);
    }
  });
});
