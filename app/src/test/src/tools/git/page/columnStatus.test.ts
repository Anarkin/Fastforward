import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  commitsCounted,
  filesCounted,
  linesCounted,
} from '../../../../../tools/git/page/columnStatus';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { noFilter, searchFilter } from '../../../../../lib/shared/filter';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { fileChange } from '../../../../helpers/gitValues';

const patchOf = (...lines: string[]) =>
  parsePatch(
    [
      'diff --git a/a.ts b/a.ts',
      'index 1111111..2222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      ...lines,
      '',
    ].join('\n'),
  )[0];

suite('Git column status', () => {
  test('counts the commits of the history shown, and nothing before it is read or when it has none', () => {
    assert.strictEqual(commitsCounted(1234), '1,234 commits');
    assert.strictEqual(commitsCounted(1), '1 commit');
    assert.strictEqual(commitsCounted(0), undefined);
    assert.strictEqual(commitsCounted(undefined), undefined);
  });

  test('counts the files changed, or those the filter keeps of them while it narrows them, and nothing when none changed', () => {
    const files = [
      fileChange('src/a.ts'),
      fileChange('src/b.ts'),
      fileChange('docs/new.md', { oldPath: 'docs/old.md' }),
    ];
    assert.strictEqual(filesCounted(files, noFilter), '3 files changed');
    assert.strictEqual(
      filesCounted(files.slice(0, 1), noFilter),
      '1 file changed',
    );
    assert.strictEqual(
      filesCounted(files, searchFilter('src', plainSearch)),
      '2 of 3 files',
    );
    assert.strictEqual(
      filesCounted(files, searchFilter('old', plainSearch)),
      '1 of 3 files',
    );
    assert.strictEqual(
      filesCounted(files.slice(0, 1), searchFilter('docs', plainSearch)),
      '0 of 1 file',
    );
    assert.strictEqual(filesCounted([], noFilter), undefined);
  });

  test('counts the lines added and removed in the text file shown, from its patch, and nothing for a binary file, a large file not loaded or none', () => {
    assert.strictEqual(
      linesCounted(
        patchOf(
          '@@ -1,4 +1,5 @@',
          ' keep',
          '-old',
          '+new',
          '+more',
          ' keep',
          '@@ -10,2 +11,1 @@',
          '-gone',
          ' keep',
        ),
      ),
      '+2 −2',
    );
    assert.strictEqual(
      linesCounted(patchOf('@@ -1,1 +1,2 @@', ' keep', '+new')),
      '+1 −0',
    );
    assert.strictEqual(
      linesCounted({ ...patchOf('@@ -1 +1 @@', '-a', '+b'), binary: true }),
      undefined,
    );
    assert.strictEqual(
      linesCounted({
        ...patchOf('@@ -1 +1 @@', '-a', '+b'),
        placeholder: { lines: 20_000 },
      }),
      undefined,
    );
    assert.strictEqual(linesCounted({ ...patchOf(), hunks: [] }), undefined);
    assert.strictEqual(linesCounted(undefined), undefined);
  });
});
