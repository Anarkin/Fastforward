import * as assert from 'node:assert';
import * as nodeFs from 'node:fs';
import { suite, test } from 'vitest';
import { filesWithoutArchives } from '../../../../lib/main/files';

suite('Files of the user', () => {
  test("reads them in Electron through its original-fs, which takes a file named *.asar for the file it is rather than an archive of Electron, and through Node's fs outside Electron, as in the tests", () => {
    const original = { ...nodeFs, promises: nodeFs.promises };
    const asked: string[] = [];
    const load = (name: string) => {
      asked.push(name);
      return original;
    };

    assert.strictEqual(filesWithoutArchives('41.0.0', load), original);
    assert.deepStrictEqual(asked, ['original-fs']);
    assert.strictEqual(filesWithoutArchives(undefined, load), nodeFs);
    assert.deepStrictEqual(asked, ['original-fs']);
  });

  test('refuses to run in Electron without original-fs rather than reading the files of the user through the fs that takes them for archives', () => {
    assert.throws(
      () => filesWithoutArchives('41.0.0', () => ({})),
      /original-fs/,
    );
    assert.throws(() =>
      filesWithoutArchives('41.0.0', () => {
        throw new Error('Cannot find module original-fs');
      }),
    );
  });
});
