import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { linkFolderTest } from '../../../../../tools/commander/main/linkFolders';
import { junctionByVolumeName } from '../../../../helpers/links';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

let folder: string;

beforeEach(() => {
  folder = tempFolder('link-folders');
});

afterEach(() => {
  removeFolder(folder);
});

suite('Folders that lead elsewhere', () => {
  test.skipIf(process.platform !== 'win32')(
    'takes a junction by the name of a volume for a link, which Node takes for a plain folder, but neither a plain folder nor one the listing marks as a reparse point that leads to itself, as a folder of OneDrive kept online only',
    async () => {
      const linkFolder = linkFolderTest('win32');
      const plain = path.join(folder, 'plain');
      fs.mkdirSync(plain);
      const mounted = path.join(folder, 'mounted');
      junctionByVolumeName(plain, mounted);

      assert.deepStrictEqual(
        [
          await linkFolder(mounted),
          await linkFolder(plain),
          await linkFolder(plain, true),
        ],
        [true, false, false],
      );
    },
  );

  test('takes no folder for a link outside Windows, where Node tells every link itself', async () => {
    const linkFolder = linkFolderTest('linux');
    assert.strictEqual(await linkFolder(folder, true), false);
  });
});
