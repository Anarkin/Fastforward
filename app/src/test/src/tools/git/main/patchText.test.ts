import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  newSideUnchanged,
  whitespaceOnlyChanges,
  withoutFilesInside,
} from '../../../../../tools/git/main/patchText';
import { section } from './patchFixtures';
import { fileChange } from '../../../../helpers/gitValues';

suite('Whitespace ignored', () => {
  test('names the modified files a patch ignoring whitespace has no section for, but no untracked or other file it lacks', () => {
    const patch = section('a.ts', 1) + section('new.ts', 1, 'old.ts');
    assert.deepStrictEqual(
      whitespaceOnlyChanges(patch, [
        fileChange('a.ts'),
        fileChange('b.ts'),
        fileChange('new.ts', { status: 'R', oldPath: 'old.ts' }),
        fileChange('new.txt', { status: 'U' }),
        fileChange('gone.ts', { status: 'D' }),
        fileChange('c d.ts'),
      ]),
      ['b.ts', 'c d.ts'],
    );
    assert.deepStrictEqual(
      whitespaceOnlyChanges('diff --git a/c d.ts b/c d.ts', [
        fileChange('c d.ts'),
      ]),
      [],
    );
    assert.deepStrictEqual(whitespaceOnlyChanges('', [fileChange('a.ts')]), [
      'a.ts',
    ]);
  });

  test('turns the patch of a whole file into its new lines unchanged, keeping the mark of a missing newline only on them', () => {
    const header = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111..2222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
    ];
    const patch = (...lines: string[]) =>
      [...header, '@@ -1,3 +1,3 @@', ...lines, ''].join('\n');
    assert.strictEqual(
      newSideUnchanged(
        patch(
          ' first',
          '-second',
          '+  second',
          '-last',
          '\\ No newline at end of file',
          '+last',
        ),
      ),
      [...header, '@@ -1,3 +1,3 @@', ' first', '   second', ' last', ''].join(
        '\n',
      ),
    );
    assert.strictEqual(
      newSideUnchanged(
        patch('-only', '+only\r', '\\ No newline at end of file'),
      ),
      [
        ...header,
        '@@ -1 +1 @@',
        ' only\r',
        '\\ No newline at end of file',
        '',
      ].join('\n'),
    );
  });
});

suite('Pathspecs', () => {
  test('drops the files inside a folder named like the file, whether git quotes their names or not', () => {
    const inside = section('dist/main.js', 1);
    const quoted = [
      'diff --git "a/dist/a\\"b.js" "b/dist/a\\"b.js"',
      'deleted file mode 100644',
      '',
    ].join('\n');
    const file = section('dist', 1);
    assert.strictEqual(
      withoutFilesInside(inside + quoted + file, { path: 'dist' }),
      file,
    );
  });

  test('keeps the file renamed from inside the folder it replaced', () => {
    const renamed = section('dist', 1, 'dist/main.js');
    const inside = section('dist/other.js', 1);
    assert.strictEqual(
      withoutFilesInside(renamed + inside, {
        path: 'dist',
        oldPath: 'dist/main.js',
      }),
      renamed,
    );
  });
});
