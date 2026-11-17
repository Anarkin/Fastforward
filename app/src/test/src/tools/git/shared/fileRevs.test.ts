import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { isFileRev, revObject } from '../../../../../tools/git/shared/fileRevs';

const hash = 'a'.repeat(40);

suite('The versions of a file', () => {
  test('takes a whole hash, the parent of one, HEAD or the index alone, never a name git would read as an option or a ref of its own', () => {
    assert.deepStrictEqual(
      [hash, `${hash}^`, 'b'.repeat(64), 'HEAD', 'index'].map(isFileRev),
      [true, true, true, true, true],
    );
    assert.deepStrictEqual(
      [
        'main',
        'HEAD~1',
        `${hash}^^`,
        hash.slice(1),
        '--output=x',
        '',
        5,
        undefined,
      ].map(isFileRev),
      [false, false, false, false, false, false, false, false],
    );
  });

  test('names the object of a path at a version as git reads it, the index by a colon alone', () => {
    assert.deepStrictEqual(
      [revObject(`${hash}^`, 'src/a.ts'), revObject('index', 'src/a.ts')],
      [`${hash}^:src/a.ts`, ':src/a.ts'],
    );
  });
});
