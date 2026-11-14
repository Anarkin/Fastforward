import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  parseFilePatch,
  parsePatch,
  type DiffFile,
} from '../../../../../tools/git/page/diff';
import {
  collapseThreshold,
  deferredChanges,
  includedChanges,
  leftOutChanges,
  patchByteBudget,
  patchLineBudget,
  patchPathBudget,
} from '../../../../../tools/git/shared/protocol';
import {
  diffSelection,
  shownFiles,
  withLargeFiles,
} from '../../../../../tools/git/page/diffColumn';
import { fileChange } from '../../../../helpers/fixtures';
import { patch, kinds } from './diffViewFixtures';
import {
  diffRows,
  largeDiffText,
} from '../../../../../tools/git/page/diffRows';
import { largeFilesToLoad } from '../../../../../tools/git/page/diffView';

const filesChanging = (...counts: readonly number[]) =>
  counts.map((insertions, index) =>
    fileChange(`${index}.ts`, { insertions, deletions: 0 }),
  );

const lines = (files: readonly DiffFile[]) =>
  files.map((file) => [
    file.path,
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  ]);

suite('Large files in a commit diff', () => {
  const large = fileChange('large.json', {
    insertions: collapseThreshold,
    deletions: 1,
  });

  test('puts each file the app left out of the diff in its place, with the count it sent', () => {
    const files = [fileChange('a.ts'), fileChange('b.ts'), fileChange('c.ts')];
    assert.deepStrictEqual(
      withLargeFiles(
        parsePatch(patch('a.ts', 1)),
        files,
        [
          { path: 'b.ts', lines: undefined },
          { path: 'c.ts', lines: 0 },
        ],
        new Map(),
      ).map((file) => [file.path, file.placeholder]),
      [
        ['a.ts', undefined],
        ['b.ts', { lines: undefined }],
        ['c.ts', { lines: 0 }],
      ],
    );
  });

  test('keeps the old path of a renamed file left out of the diff, selected or not, so its header and the file search know it until it loads', () => {
    const renamed = fileChange('new/y.json', {
      status: 'R',
      oldPath: 'old/x.json',
    });
    const leftOut = [{ path: 'new/y.json', lines: 5 }];
    assert.deepStrictEqual(
      [
        withLargeFiles([], [renamed], leftOut, new Map()),
        shownFiles([], 'new/y.json', [renamed], leftOut, new Map()),
      ].map(([file]) => [file.path, file.oldPath]),
      [
        ['new/y.json', 'old/x.json'],
        ['new/y.json', 'old/x.json'],
      ],
    );
  });

  test('puts a large file the diff left out in its place, until it loads', () => {
    const files = [fileChange('a.ts'), large, fileChange('b.ts')];
    const parsed = parsePatch(`${patch('b.ts', 1)}\n${patch('a.ts', 1)}`);
    const placeholder = withLargeFiles(
      parsed,
      files,
      leftOutChanges(files),
      new Map(),
    );
    assert.deepStrictEqual(
      placeholder.map((file) => [file.path, file.placeholder]),
      [
        ['a.ts', undefined],
        ['large.json', { lines: collapseThreshold + 1 }],
        ['b.ts', undefined],
      ],
    );

    const loaded = withLargeFiles(
      parsed,
      files,
      leftOutChanges(files),
      new Map([
        ['large.json', parseFilePatch('large.json', patch('large.json', 3))],
      ]),
    );
    assert.strictEqual(loaded[1].placeholder, undefined);
    assert.strictEqual(loaded[1].hunks[0].lines.length, 3);
  });

  test('keeps a large file left out even when git diffs it for a kept path it is under, as when a file turns into a folder', () => {
    const big = fileChange('foo/big.txt', {
      insertions: collapseThreshold + 1,
      deletions: 0,
    });
    const files = [fileChange('foo'), big];
    const parsed = parsePatch(`${patch('foo', 1)}\n${patch('foo/big.txt', 3)}`);
    assert.deepStrictEqual(
      shownFiles(
        parsed,
        undefined,
        files,
        leftOutChanges(files),
        new Map(),
      ).map((file) => [file.path, file.placeholder]),
      [
        ['foo', undefined],
        ['foo/big.txt', { lines: collapseThreshold + 1 }],
      ],
    );
    assert.deepStrictEqual(
      shownFiles(parsed, 'foo', files, leftOutChanges(files), new Map()).map(
        (file) => file.path,
      ),
      ['foo'],
    );
  });

  test('puts a selected large file the app left out in its place, until it loads', () => {
    const files = [fileChange('a.ts'), large];
    assert.deepStrictEqual(
      shownFiles(
        [],
        'large.json',
        files,
        leftOutChanges([large]),
        new Map(),
      ).map((file) => [file.path, file.placeholder]),
      [['large.json', { lines: collapseThreshold + 1 }]],
    );
    const loaded = shownFiles(
      [],
      'large.json',
      files,
      leftOutChanges([large]),
      new Map([
        ['large.json', parseFilePatch('large.json', patch('large.json', 3))],
      ]),
    );
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].placeholder, undefined);
    assert.strictEqual(loaded[0].hunks[0].lines.length, 3);
  });

  test('shows only the selected file when git diffs the paths under it too, as when a file turns into a folder', () => {
    const files = [fileChange('foo'), fileChange('foo/bar.txt')];
    const parsed = parsePatch(`${patch('foo', 1)}\n${patch('foo/bar.txt', 1)}`);
    assert.deepStrictEqual(
      shownFiles(parsed, 'foo', files, [], new Map()).map((file) => file.path),
      ['foo'],
    );
  });

  test('defers each file over 25000 changed lines, and every file once the diff would grow past its budget, as the page would freeze laying them out', () => {
    const fitting = [];
    for (let left = patchLineBudget - 3; left > 0;) {
      const insertions = Math.min(collapseThreshold, left);
      fitting.push(
        fileChange(`${fitting.length}.ts`, { insertions, deletions: 0 }),
      );
      left -= insertions;
    }
    const files = [
      ...fitting,
      large,
      fileChange('a.ts', { insertions: collapseThreshold, deletions: 0 }),
      fileChange('b.ts', { insertions: 0, deletions: 0 }),
    ];
    assert.deepStrictEqual(
      [...deferredChanges(files)],
      ['large.json', 'a.ts', 'b.ts'],
    );
    assert.deepStrictEqual(
      [...deferredChanges([...fitting, large, fileChange('b.ts')])],
      ['large.json'],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(25_000, 1))],
      ['1.ts'],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(25_001, 1))],
      ['0.ts'],
    );
  });

  test('keeps a diff of exactly the 25000 changed lines of its budget whole, deferring from the file that passes it', () => {
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(20_000, 5_000, 0))],
      [],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(20_000, 5_001, 0))],
      ['1.ts', '2.ts'],
    );
  });

  test('defers every file once the paths of the rest would make too long a command line', () => {
    const long = 'x'.repeat(patchPathBudget / 2);
    const files = [
      fileChange(`${long}1`, { oldPath: 'a' }),
      fileChange('b'),
      fileChange(`${long}2`),
      fileChange('c'),
    ];
    assert.deepStrictEqual([...deferredChanges(files)], [`${long}2`, 'c']);
  });

  test('keeps the paths of a diff of exactly the 16000 characters of its budget whole, deferring from the file that passes it', () => {
    const half = 8_000;
    const files = (last: string) => [
      fileChange('x'.repeat(half)),
      fileChange('y'.repeat(half - 2), { oldPath: 'z' }),
      fileChange(last),
    ];
    assert.deepStrictEqual([...deferredChanges(files('c'))], []);
    assert.deepStrictEqual(
      [...deferredChanges([...files('cc'), fileChange('d')])],
      ['cc', 'd'],
    );
  });

  test('defers every file once the old and new text of the files changed would pass the bytes of its budget, however few lines they have', () => {
    const files = [
      fileChange('bundle.min.js', { bytes: patchByteBudget / 2 }),
      fileChange('a.ts', { bytes: 100 }),
      fileChange('bundle.js.map', { bytes: patchByteBudget / 2 }),
      fileChange('b.ts'),
    ];
    assert.deepStrictEqual(
      [...deferredChanges(files)],
      ['bundle.js.map', 'b.ts'],
    );
  });

  test('keeps a diff of exactly the 16 MB of its budget whole, deferring from the file that passes it', () => {
    const half = 8 * 1024 * 1024;
    const files = (bytes: number) => [
      fileChange('a.min.js', { bytes: half }),
      fileChange('b.min.js', { bytes }),
      fileChange('c.ts'),
    ];
    assert.deepStrictEqual([...deferredChanges(files(half))], []);
    assert.deepStrictEqual(
      [...deferredChanges(files(half + 1))],
      ['b.min.js', 'c.ts'],
    );
  });

  test('counts toward the bytes of its budget only the files it keeps, not one left out for its lines', () => {
    const files = [
      fileChange('huge.json', {
        insertions: 0,
        deletions: 0,
        uncounted: true,
        bytes: patchByteBudget,
      }),
      fileChange('a.ts', { bytes: patchByteBudget }),
      fileChange('b.ts'),
    ];
    assert.deepStrictEqual([...deferredChanges(files)], ['huge.json']);
  });

  test('passes git no paths when it leaves out no file, and only the paths of the files it keeps, both of a rename, once it leaves out any', () => {
    const files = [
      fileChange('a.ts'),
      fileChange('new.ts', { status: 'R', oldPath: 'old.ts' }),
    ];
    assert.strictEqual(includedChanges(files), undefined);
    assert.deepStrictEqual(includedChanges([...files, large]), [
      'a.ts',
      'old.ts',
      'new.ts',
    ]);
  });

  test('passes git the paths of the files it keeps rather than those it leaves out, so the command line stays under the 32767 characters Windows allows', () => {
    const files = Array.from({ length: 4000 }, (_, index) =>
      fileChange(`a b/${index}.ts`, {
        status: 'R',
        oldPath: `c d/${index}.ts`,
      }),
    );
    const included = includedChanges(files) ?? [];
    assert.ok(included.length > 0);
    assert.ok(included.map((file) => `"${file}"`).join(' ').length < 32_767);
  });

  test('puts a file deferred for the budget in its place, collapsed until asked for', () => {
    const deferred = 'x'.repeat(patchPathBudget);
    const files = [fileChange('a.ts'), fileChange(deferred)];
    const diff = withLargeFiles(
      parsePatch(patch('a.ts', 1)),
      files,
      leftOutChanges(files),
      new Map(),
    );
    assert.deepStrictEqual(diff[1].placeholder, { lines: 3 });
    assert.deepStrictEqual(kinds(diffRows(diff, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'file',
      'large',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows(diff, new Map([[deferred, true]]), undefined)),
      ['error', 'file', 'line', 'file', 'skeletonLines'],
    );
  });

  test('puts a file too large to count the lines of in its place, saying it is large without making up a count', () => {
    const huge = fileChange('huge.log', {
      insertions: 0,
      deletions: 0,
      uncounted: true,
    });
    assert.deepStrictEqual([...deferredChanges([huge])], ['huge.log']);
    const diff = withLargeFiles([], [huge], leftOutChanges([huge]), new Map());
    assert.deepStrictEqual(diff[0].placeholder, { lines: undefined });
    const rows = diffRows(diff, new Map(), undefined);
    assert.deepStrictEqual(rows[2], {
      kind: 'large',
      file: 0,
      path: 'huge.log',
      lines: undefined,
    });
    assert.strictEqual(largeDiffText(undefined), 'Large file');
  });

  test('says how many lines a file not loaded changed, or only that it is not loaded when it changed none, as a binary file', () => {
    assert.strictEqual(largeDiffText(3), 'Not loaded: 3 changed lines');
    assert.strictEqual(largeDiffText(1), 'Not loaded: 1 changed line');
    assert.strictEqual(largeDiffText(0), 'Not loaded');
    assert.strictEqual(
      largeDiffText(collapseThreshold + 1),
      `Large diff: ${(collapseThreshold + 1).toLocaleString()} changed lines`,
    );
  });

  test('keeps both halves of a file that changed type, the lines of the file and the target of the link, and the blob of each', () => {
    const typeChange = [
      'diff --git a/f b/f',
      'deleted file mode 100644',
      'index ce01362..0000000',
      '--- a/f',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-hello',
      'diff --git a/f b/f',
      'new file mode 120000',
      'index 0000000..eb4e8a8',
      '--- /dev/null',
      '+++ b/f',
      '@@ -0,0 +1 @@',
      '+target',
      '\\ No newline at end of file',
    ].join('\n');
    const both = [['f', ['hello']]];
    const parsed = parsePatch(typeChange);
    assert.deepStrictEqual(lines(parsed), both);
    assert.deepStrictEqual(
      lines(withLargeFiles(parsed, [fileChange('f')], [], new Map())),
      both,
    );
    assert.deepStrictEqual(lines([parseFilePatch('f', typeChange)]), both);
    assert.deepStrictEqual(parseFilePatch('f', typeChange).link, {
      new: 'target',
    });
    assert.deepStrictEqual(parsed[0].blobs, {
      old: 'ce01362',
      new: 'eb4e8a8',
    });
  });

  test('keeps files the list lacks, and leaves out small ones the diff lacks', () => {
    const parsed = parsePatch(patch('extra.ts', 1));
    assert.deepStrictEqual(
      withLargeFiles(parsed, [fileChange('a.ts')], [], new Map()).map(
        (file) => file.path,
      ),
      ['extra.ts'],
    );
  });
});

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

suite('Newline at the end of a file', () => {
  test('notes below the lines of a file that only one side lacks the newline at its end, as lines that differ only in it look the same', () => {
    const files = parsePatch(
      [
        'diff --git a/a.md b/a.md',
        'index 1111111..2222222 100644',
        '--- a/a.md',
        '+++ b/a.md',
        '@@ -1 +1 @@',
        '-last',
        '\\ No newline at end of file',
        '+last',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'line',
      'noNewline',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows(files, new Map(), undefined, false, true)),
      ['error', 'file', 'split', 'noNewline'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [...files, ...parsePatch(patch('b.ts', 1))],
          new Map([['a.md', false]]),
          undefined,
        ),
      ),
      ['error', 'file', 'file', 'line'],
    );
  });
});

const placeholder = (path: string) => ({
  path,
  binary: false,
  hunks: [],
  placeholder: { lines: collapseThreshold + 1 },
});

suite('Large files fetched', () => {
  test('fetches an opened large file once, not again as others come', () => {
    const requested = new Map<string, number>();
    const open = new Map([
      ['a.json', true],
      ['b.json', true],
    ]);
    const files = [placeholder('a.json'), placeholder('b.json')];
    assert.deepStrictEqual(largeFilesToLoad(files, open, 0, requested), [
      'a.json',
      'b.json',
    ]);
    const aLoaded = [
      parseFilePatch('a.json', patch('a.json', 1)),
      placeholder('b.json'),
    ];
    assert.deepStrictEqual(largeFilesToLoad(aLoaded, open, 0, requested), []);
  });

  test('fetches it again once it is a placeholder again, or reopened', () => {
    const requested = new Map<string, number>();
    const open = new Map([['a.json', true]]);
    largeFilesToLoad([placeholder('a.json')], open, 0, requested);
    const loaded = [parseFilePatch('a.json', patch('a.json', 1))];
    largeFilesToLoad(loaded, open, 0, requested);
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, 0, requested),
      ['a.json'],
    );

    const closed = new Map([['a.json', false]]);
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], closed, 0, requested),
      [],
    );
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, 0, requested),
      ['a.json'],
    );
  });

  test('fetches it again for a new diff that came before it loaded', () => {
    const requested = new Map<string, number>();
    const open = new Map([['a.json', true]]);
    largeFilesToLoad([placeholder('a.json')], open, 0, requested);
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, 1, requested),
      ['a.json'],
    );
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, 1, requested),
      [],
    );
  });

  test('takes a file git found no change in as loaded, without lines', () => {
    const empty = parseFilePatch('a.json', '');
    assert.deepStrictEqual(empty, { path: 'a.json', binary: false, hunks: [] });
    assert.deepStrictEqual(
      largeFilesToLoad([empty], new Map([['a.json', true]]), 0, new Map()),
      [],
    );
  });

  test('starts the requests of a diff over in another tab, though it shows the same commit and file', () => {
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', undefined),
      diffSelection('/b', 'working-tree', undefined),
    );
    assert.strictEqual(
      diffSelection('/a', 'working-tree', 'a.ts'),
      diffSelection('/a', 'working-tree', 'a.ts'),
    );
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', 'a.ts', 'staged'),
      diffSelection('/a', 'working-tree', 'a.ts', 'unstaged'),
    );
    assert.notStrictEqual(
      diffSelection('/a', 'working-tree', 'a.ts'),
      diffSelection('/a', 'working-tree', undefined),
    );
  });
});
