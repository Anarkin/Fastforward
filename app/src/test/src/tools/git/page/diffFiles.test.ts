import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  parseFilePatch,
  parsePatch,
  type DiffFile,
} from '../../../../../tools/git/page/diff';
import { collapseThreshold } from '../../../../../tools/git/shared/protocol';
import {
  filteredDiffFiles,
  shownFiles,
  withLargeFiles,
} from '../../../../../tools/git/page/diffFiles';
import { fileChange } from '../../../../helpers/fixtures';
import { patch, kinds } from './diffViewFixtures';
import { diffRows } from '../../../../../tools/git/page/diffRows';

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
    assert.deepStrictEqual(kinds(diffRows(diff, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'file',
      'whitespace',
    ]);
  });

  test('notes the same for such a file selected, side by side too, and above its lines when shown entire', () => {
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(
        kinds(
          diffRows(
            shownFiles([], 'b.ts', files, [], new Map(), ['b.ts']),
            new Map(),
            undefined,
            false,
            sideBySide,
          ),
        ),
        ['error', 'file', 'whitespace'],
      );
    }
    assert.deepStrictEqual(shownFiles([], 'b.ts', files, [], new Map()), []);
    const entire = parsePatch(
      ['diff --git a/b.ts b/b.ts', '@@ -1,2 +1,2 @@', ' one', ' two'].join(
        '\n',
      ),
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          shownFiles(entire, 'b.ts', files, [], new Map(), ['b.ts']),
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'whitespace', 'line', 'line'],
    );
  });

  test('notes a file left out of the diff that loads with only whitespace changed, above its lines when shown entire', () => {
    assert.deepStrictEqual(
      kinds(diffRows(loadedWhitespaceOnly(''), new Map(), undefined)),
      ['error', 'file', 'whitespace'],
    );
    const entire = [
      'diff --git a/large.json b/large.json',
      '@@ -1,2 +1,2 @@',
      ' one',
      ' two',
    ].join('\n');
    assert.deepStrictEqual(
      kinds(diffRows(loadedWhitespaceOnly(entire), new Map(), undefined)),
      ['error', 'file', 'whitespace', 'line', 'line'],
    );
    assert.strictEqual(
      parseFilePatch('large.json', '').whitespaceOnly,
      undefined,
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
      filteredDiffFiles(files, path, filter).map((shown) => shown.path);
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
