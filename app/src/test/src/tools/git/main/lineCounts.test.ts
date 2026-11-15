import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { LineCounts } from '../../../../../tools/git/main/lineCounts';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';

suite('Lines of untracked files', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('line-counts');
  });

  afterEach(() => removeFolder(folder));

  test('counts the lines of a file again only once it changes on disk, as each refresh would read every one whole', async () => {
    const file = path.join(folder, 'new.txt');
    fs.writeFileSync(file, 'one\n');
    const counted: string[] = [];
    const counts = new LineCounts(10, (counting) => {
      counted.push(counting);
      return Promise.resolve(
        fs.readFileSync(counting, 'utf8').split('\n').length - 1,
      );
    });
    assert.strictEqual(await counts.of(file), 1);
    assert.strictEqual(await counts.of(file), 1);
    fs.writeFileSync(file, 'one\ntwo\n');
    assert.strictEqual(await counts.of(file), 2);
    assert.deepStrictEqual(counted, [file, file]);
  });
});
