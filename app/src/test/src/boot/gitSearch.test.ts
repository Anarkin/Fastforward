import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { searchingAgain } from '../../../boot/gitSearch';
import type { GitSearch } from '../../../tools/git/main/locate';

suite('Searching for git again', () => {
  test('looks on the PATH the app started with and in the folders saved to the PATH of Windows since, read again at each look, so installing Git for Windows needs no restart', async () => {
    const saved = [
      ['C:\\Windows\\system32'],
      ['C:\\Windows\\system32'],
      ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\cmd'],
    ];
    const paths: (string | undefined)[] = [];
    const search = searchingAgain(
      { Path: 'C:\\Windows\\system32' },
      () => saved.shift() ?? [],
      (env) => {
        paths.push(env.Path);
        return Promise.resolve<GitSearch>({ kind: 'missing' });
      },
    );

    await search();
    await search();

    assert.deepStrictEqual(paths, [
      'C:\\Windows\\system32',
      'C:\\Windows\\system32;C:\\Program Files\\Git\\cmd',
    ]);
  });
});
