import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { removeUnviewedCopies, viewedRootsOf } from '../../../boot/viewedFiles';
import { removeFolder, tempFolder } from '../../helpers/tempFolders';

suite('Copies of viewed files', () => {
  let folder: string;
  let copies: string;

  beforeEach(() => {
    folder = tempFolder('viewed');
    copies = path.join(folder, 'viewed-files');
    for (const [blob, name] of [
      ['aaa', 'a.txt'],
      ['bbb', 'b.txt'],
      ['ccc', 'c.txt'],
    ]) {
      fs.mkdirSync(path.join(copies, blob), { recursive: true });
      fs.writeFileSync(path.join(copies, blob, name), blob);
    }
  });

  afterEach(() => removeFolder(folder));

  test('removes the copies no saved tab views as the app starts, keeping those a tab views, as a viewer tab of a commit restored after a restart could not read its file', async () => {
    await removeUnviewedCopies(copies, [
      path.join(copies, 'bbb', 'b.txt'),
      path.join(folder, 'elsewhere.txt'),
    ]);
    assert.deepStrictEqual(fs.readdirSync(copies), ['bbb']);
    assert.strictEqual(
      fs.readFileSync(path.join(copies, 'bbb', 'b.txt'), 'utf8'),
      'bbb',
    );
  });

  test('leaves a copy it cannot remove, as one another program holds open on Windows, going on with the rest', async () => {
    const remove = fs.promises.rm;
    Reflect.set(fs.promises, 'rm', (...args: Parameters<typeof remove>) =>
      String(args[0]).endsWith('aaa')
        ? Promise.reject(
            Object.assign(new Error('EBUSY: resource busy or locked'), {
              code: 'EBUSY',
            }),
          )
        : remove(...args),
    );
    try {
      await removeUnviewedCopies(copies, []);
    } finally {
      Reflect.set(fs.promises, 'rm', remove);
    }
    assert.deepStrictEqual(fs.readdirSync(copies), ['aaa']);
  });

  test('keeps the files a saved viewer or editor tab shows and those a saved diff tab compares, as a diff tab of two files of an archive came back after a restart comparing files no longer there', () => {
    assert.deepStrictEqual(
      viewedRootsOf([
        { id: '1', tool: 'viewer', root: 'viewed/a/a.txt' },
        { id: '2', tool: 'editor', root: 'viewed/b/b.txt' },
        {
          id: '3',
          tool: 'diff',
          compare: { old: 'viewed/c/c.txt', new: 'notes.txt' },
        },
        { id: '4', tool: 'commander', root: 'folder' },
        { id: '5', tool: 'diff', root: 'repository' },
      ]),
      ['viewed/a/a.txt', 'viewed/b/b.txt', 'viewed/c/c.txt', 'notes.txt'],
    );
  });

  test('removes nothing where no file was ever viewed', async () => {
    await removeUnviewedCopies(path.join(folder, 'none'), []);
    assert.ok(!fs.existsSync(path.join(folder, 'none')));
  });
});
