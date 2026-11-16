import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { linesCounted } from '../../../../../components/diff/page/lineCounts';
import {
  parsePatch,
  type DiffFile,
} from '../../../../../components/diff/page/diff';
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

const counted = (file: DiffFile) => linesCounted([file], []);

const large = (path: string): DiffFile => ({
  path,
  binary: false,
  hunks: [],
  placeholder: { lines: undefined },
});

suite('Lines counted under a diff', () => {
  test('counts the lines added and removed in the text file shown, from its patch, and nothing for a binary file, a large file not loaded or none', () => {
    assert.strictEqual(
      counted(
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
      counted(patchOf('@@ -1,1 +1,2 @@', ' keep', '+new')),
      '+1 −0',
    );
    assert.strictEqual(
      counted({ ...patchOf('@@ -1 +1 @@', '-a', '+b'), binary: true }),
      undefined,
    );
    assert.strictEqual(
      counted({
        ...patchOf('@@ -1 +1 @@', '-a', '+b'),
        placeholder: { lines: 20_000 },
      }),
      undefined,
    );
    assert.strictEqual(counted({ ...patchOf(), hunks: [] }), undefined);
    assert.strictEqual(linesCounted([], []), undefined);
  });

  test('adds up the lines of every file shown, as All Changes, Staged, Unstaged or a commit show them, binary files and those changed only in whitespace adding none', () => {
    assert.strictEqual(
      linesCounted(
        [
          patchOf('@@ -1,2 +1,2 @@', '-old', '+new', ' keep'),
          {
            ...patchOf('@@ -1 +1,3 @@', ' keep', '+one', '+two'),
            path: 'b.ts',
          },
          { ...patchOf(), path: 'c.png', binary: true, hunks: [] },
          { ...patchOf(), path: 'd.ts', hunks: [], whitespaceOnly: true },
        ],
        [fileChange('a.ts'), fileChange('b.ts'), fileChange('c.png')],
      ),
      '+3 −1',
    );
  });

  test('adds the lines git counted for a large file not loaded, and says how many it could not count, as git counts none for the files of a commit', () => {
    const shown = [patchOf('@@ -1 +1 @@', '-a', '+b'), large('big.json')];
    assert.strictEqual(
      linesCounted(shown, [
        fileChange('a.ts'),
        fileChange('big.json', { insertions: 40_000, deletions: 12 }),
      ]),
      '+40,001 −13',
    );
    assert.strictEqual(
      linesCounted(shown, [
        fileChange('a.ts'),
        fileChange('big.json', { insertions: 0, deletions: 0 }),
      ]),
      '+1 −1, 1 file not counted',
    );
    assert.strictEqual(
      linesCounted(
        [...shown, large('huge.log')],
        [
          fileChange('a.ts'),
          fileChange('big.json', { uncounted: true }),
          fileChange('huge.log', { insertions: 0, deletions: 0 }),
        ],
      ),
      '+1 −1, 2 files not counted',
    );
    assert.strictEqual(
      linesCounted(
        [large('big.json')],
        [fileChange('big.json', { uncounted: true })],
      ),
      undefined,
    );
  });
});
