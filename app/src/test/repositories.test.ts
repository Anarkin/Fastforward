import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { foldersLeft, removeFolder, tempFolder } from './repositories';

suite('Folders left behind', () => {
  test('tries the folders again until its time is up, then names each one still there with why, rather than outlasting the hook', async () => {
    const tries = new Map<string, number>();
    const started = Date.now();
    const left = await foldersLeft(['a', 'b', 'c'], started + 600, (folder) => {
      const tried = (tries.get(folder) ?? 0) + 1;
      tries.set(folder, tried);
      return folder === 'c' || (folder === 'b' && tried === 1)
        ? new Error(`EBUSY: resource busy or locked, rmdir '${folder}'`)
        : undefined;
    });
    assert.deepStrictEqual(left, [
      "c: EBUSY: resource busy or locked, rmdir 'c'",
    ]);
    assert.strictEqual(tries.get('a'), 1);
    assert.strictEqual(tries.get('b'), 2);
    assert.ok((tries.get('c') ?? 0) > 2);
    assert.ok(Date.now() - started < 1500);
  });

  test("leaves a folder it can't remove, such as one a git still runs in on Windows, for after the file's tests rather than failing the teardown, which would skip the rest of its suite", () => {
    const folder = tempFolder('busy');
    assert.doesNotThrow(() =>
      removeFolder(folder, () => new Error('EBUSY: resource busy or locked')),
    );
    assert.ok(fs.existsSync(folder));
  });
});
