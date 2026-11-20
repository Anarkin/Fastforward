import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../../helpers/filters';
import {
  parseFilePatch,
  parsePatch,
  type DiffFile,
} from '../../../../../components/diff/page/diff';
import { collapseThreshold } from '../../../../../components/diff/shared/patchBudget';
import {
  filteredDiffFiles,
  shownFiles,
  withLargeFiles,
} from '../../../../../components/diff/page/files';
import { patch, noted } from '../../../tools/git/page/diffViewFixtures';
import { diffRows } from '../../../../../components/diff/page/rows';
import { fileChange } from '../../../../helpers/gitValues';

const loadedWhitespaceOnly = (filePatch: string) =>
  withLargeFiles(
    [],
    [fileChange('large.json')],
    [{ path: 'large.json', lines: collapseThreshold + 1 }],
    new Map([['large.json', parseFilePatch('large.json', filePatch, true)]]),
  );

suite('Files whose changes are all whitespace', () => {
  const files = [fileChange('a.ts'), fileChange('b.ts'), fileChange('c.ts')];

  test('puts each file a diff ignoring whitespace left out for it in its place, noting that only whitespace changed', () => {
    const diff = withLargeFiles(
      parsePatch(patch('a.ts', 1)),
      files,
      [],
      new Map(),
      new Set(['b.ts']),
    );
    assert.deepStrictEqual(
      diff.map((file) => [file.path, file.whitespaceOnly]),
      [
        ['a.ts', undefined],
        ['b.ts', true],
      ],
    );
    assert.deepStrictEqual(noted(diff, diffRows(diff, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'file: Only whitespace changed',
    ]);
  });

  test('notes the same on the header of such a file selected, side by side too, and above its lines when shown entire', () => {
    for (const sideBySide of [false, true]) {
      const shown = shownFiles([], 'b.ts', files, [], new Map(), ['b.ts']);
      assert.deepStrictEqual(
        noted(shown, diffRows(shown, new Map(), undefined, false, sideBySide)),
        ['error', 'file: Only whitespace changed'],
      );
    }
    assert.deepStrictEqual(shownFiles([], 'b.ts', files, [], new Map()), []);
    const entire = parsePatch(
      ['diff --git a/b.ts b/b.ts', '@@ -1,2 +1,2 @@', ' one', ' two'].join(
        '\n',
      ),
    );
    const whole = shownFiles(entire, 'b.ts', files, [], new Map(), ['b.ts']);
    assert.deepStrictEqual(
      noted(whole, diffRows(whole, new Map(), undefined)),
      ['error', 'file: Only whitespace changed', 'line', 'line'],
    );
  });

  test('notes a file left out of the diff that loads with only whitespace changed, above its lines when shown entire', () => {
    const loaded = loadedWhitespaceOnly('');
    assert.deepStrictEqual(
      noted(loaded, diffRows(loaded, new Map(), undefined)),
      ['error', 'file: Only whitespace changed'],
    );
    const entire = [
      'diff --git a/large.json b/large.json',
      '@@ -1,2 +1,2 @@',
      ' one',
      ' two',
    ].join('\n');
    const loadedWhole = loadedWhitespaceOnly(entire);
    assert.deepStrictEqual(
      noted(loadedWhole, diffRows(loadedWhole, new Map(), undefined)),
      ['error', 'file: Only whitespace changed', 'line', 'line'],
    );
    assert.strictEqual(
      parseFilePatch('large.json', '').whitespaceOnly,
      undefined,
    );
  });
});

suite('Order of the files', () => {
  test('shows the files in the order of the list it is handed, which its host decides, rather than in the order of the patch', () => {
    const parsed = parsePatch(
      [patch('a.ts', 1), patch('b/c.ts', 1), patch('d.ts', 1)].join('\n'),
    );
    const listed = ['b/c.ts', 'd.ts', 'a.ts'];
    assert.deepStrictEqual(
      shownFiles(
        parsed,
        undefined,
        listed.map((path) => fileChange(path)),
        [{ path: 'd.ts', lines: collapseThreshold + 1 }],
        new Map(),
      ).map((file) => [file.path, file.placeholder !== undefined]),
      [
        ['b/c.ts', false],
        ['d.ts', true],
        ['a.ts', false],
      ],
    );
  });
});

const diffFile = (path: string, oldPath?: string): DiffFile => ({
  path,
  ...(oldPath === undefined ? {} : { oldPath }),
  binary: false,
  hunks: [],
});

suite('File filter', () => {
  test('shows the diffs of only the files the search finds while no file is selected, and the one selected whatever it is', () => {
    const files = [
      diffFile('a/view.ts'),
      diffFile('b/api.ts', 'b/view.ts'),
      diffFile('c.ts'),
    ];
    const paths = (path: string | undefined, filter: string | undefined) =>
      filteredDiffFiles(files, path, plainFilter(filter ?? '')).map(
        (shown) => shown.path,
      );
    assert.deepStrictEqual(paths(undefined, 'view'), ['a/view.ts', 'b/api.ts']);
    assert.deepStrictEqual(paths(undefined, undefined), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
    assert.deepStrictEqual(paths(undefined, ' '), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
    assert.deepStrictEqual(paths('c.ts', 'view'), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
  });
});
