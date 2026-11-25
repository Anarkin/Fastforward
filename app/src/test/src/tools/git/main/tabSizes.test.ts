import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { tabSizesOf } from '../../../../../tools/git/main/tabSizes';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Tab widths of the files of a diff', () => {
  test('takes the width of a tab of each file from the .editorconfig of the working tree, tab_width over indent_size, and names none for a file it sets nothing for', async () => {
    const root = tempFolder('tab-sizes');
    try {
      fs.mkdirSync(path.join(root, 'go'));
      fs.writeFileSync(
        path.join(root, '.editorconfig'),
        [
          'root = true',
          '[*.ts]',
          'indent_size = 2',
          '[*.go]',
          'tab_width = 8',
          '',
        ].join(String.fromCharCode(10)),
      );
      assert.deepStrictEqual(
        await tabSizesOf(root, ['a.ts', 'go/b.go', 'c.txt']),
        { 'a.ts': 2, 'go/b.go': 8 },
      );
    } finally {
      removeFolder(root);
    }
  });
});
