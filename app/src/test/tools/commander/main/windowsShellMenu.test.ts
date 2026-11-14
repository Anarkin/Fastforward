import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../support/repositories';

suite.skipIf(process.platform !== 'win32')('The menu of the system', () => {
  test('builds the menu Explorer shows for the files and folders chosen together, with the commands it runs, but no Rename, which works in Explorer alone', async () => {
    const { shellVerbs } =
      await import('../../../../tools/commander/main/windowsShellMenu.js');
    const folder = tempFolder('shell-menu');
    try {
      const file = path.join(folder, 'notes.txt');
      const inside = path.join(folder, 'inside');
      fs.writeFileSync(file, 'notes\n');
      fs.mkdirSync(inside);

      const verbs = shellVerbs([file, inside], false);

      for (const verb of ['cut', 'copy', 'delete', 'properties']) {
        assert.ok(verbs.includes(verb), verbs.join(', '));
      }
      assert.ok(!verbs.includes('rename'), verbs.join(', '));
    } finally {
      removeFolder(folder);
    }
  });

  test('builds no menu for files that are gone, rather than one for what is left', async () => {
    const { shellVerbs } =
      await import('../../../../tools/commander/main/windowsShellMenu.js');
    const folder = tempFolder('shell-menu-gone');
    try {
      const file = path.join(folder, 'notes.txt');
      fs.writeFileSync(file, 'notes\n');

      assert.deepStrictEqual(
        shellVerbs([file, path.join(folder, 'gone.txt')], false),
        [],
      );
    } finally {
      removeFolder(folder);
    }
  });
});
