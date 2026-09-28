import * as assert from 'node:assert';
import { parseFilePatch, parsePatch } from '../webview/diff';
import { collapseThreshold } from '../shared/protocol';
import { withLargeFiles } from '../webview/diffColumn';
import { diffRows, largeFilesToLoad, rowHeight } from '../webview/diffView';
import { fileChange } from './fixtures';

function patch(path: string, added: number): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${added} @@`,
    ...Array.from({ length: added }, (_, index) => `+line ${index}`),
  ].join('\n');
}

const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

suite('Diff rows', () => {
  test('lays out a small file whole', () => {
    const files = parsePatch(patch('a.ts', 2));
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'line',
    ]);
  });

  test('divides the changed parts of a file', () => {
    const files = parsePatch(
      [patch('a.ts', 1), '@@ -10,0 +11,1 @@ function f()', '+line'].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'hunk',
      'line',
    ]);
  });

  test('collapses a large file, and opens it when asked', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    const collapsed = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(collapsed), ['error', 'file', 'large']);

    const opened = diffRows(files, new Map([['graph.json', true]]), undefined);
    assert.strictEqual(opened.length, 2 + collapseThreshold + 1);
  });

  test('closes a small file when asked', () => {
    const files = parsePatch(patch('a.ts', 2));
    const rows = diffRows(files, new Map([['a.ts', false]]), undefined);
    assert.deepStrictEqual(kinds(rows), ['error', 'file']);
  });

  test('lays out a whole file line by line', () => {
    const rows = diffRows([], new Map(), {
      path: 'README.md',
      content: 'one\ntwo\n',
      binary: false,
    });
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'wholeLine',
      'wholeLine',
    ]);
  });
});

suite('Large files in a commit diff', () => {
  const large = fileChange('large.json', {
    insertions: collapseThreshold,
    deletions: 1,
  });

  test('puts a large file the diff left out in its place, until it loads', () => {
    const files = [fileChange('a.ts'), large, fileChange('b.ts')];
    const parsed = parsePatch(`${patch('b.ts', 1)}\n${patch('a.ts', 1)}`);
    const placeholder = withLargeFiles(parsed, files, new Map());
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
      new Map([
        ['large.json', parseFilePatch('large.json', patch('large.json', 3))],
      ]),
    );
    assert.strictEqual(loaded[1].placeholder, undefined);
    assert.strictEqual(loaded[1].hunks[0].lines.length, 3);
  });

  test('keeps files the list lacks, and leaves out small ones the diff lacks', () => {
    const parsed = parsePatch(patch('extra.ts', 1));
    assert.deepStrictEqual(
      withLargeFiles(parsed, [fileChange('a.ts')], new Map()).map(
        (file) => file.path,
      ),
      ['extra.ts'],
    );
  });
});

// A large file the commit's diff left out, until it is fetched
const placeholder = (path: string) => ({
  path,
  binary: false,
  hunks: [],
  placeholder: { lines: collapseThreshold + 1 },
});

suite('Large files fetched', () => {
  test('fetches an opened large file once, not again as others come', () => {
    const requested = new Set<string>();
    const open = new Map([
      ['a.json', true],
      ['b.json', true],
    ]);
    const files = [placeholder('a.json'), placeholder('b.json')];
    assert.deepStrictEqual(largeFilesToLoad(files, open, requested), [
      'a.json',
      'b.json',
    ]);
    const aLoaded = [
      parseFilePatch('a.json', patch('a.json', 1)),
      placeholder('b.json'),
    ];
    assert.deepStrictEqual(largeFilesToLoad(aLoaded, open, requested), []);
  });

  test('fetches it again once it is a placeholder again, or reopened', () => {
    const requested = new Set<string>();
    const open = new Map([['a.json', true]]);
    largeFilesToLoad([placeholder('a.json')], open, requested);
    const loaded = [parseFilePatch('a.json', patch('a.json', 1))];
    largeFilesToLoad(loaded, open, requested);
    // The diff was fetched again, after a save
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, requested),
      ['a.json'],
    );

    const closed = new Map([['a.json', false]]);
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], closed, requested),
      [],
    );
    assert.deepStrictEqual(
      largeFilesToLoad([placeholder('a.json')], open, requested),
      ['a.json'],
    );
  });

  test('takes a file git found no change in as loaded, without lines', () => {
    const empty = parseFilePatch('a.json', '');
    assert.deepStrictEqual(empty, { path: 'a.json', binary: false, hunks: [] });
    assert.deepStrictEqual(
      largeFilesToLoad([empty], new Map([['a.json', true]]), new Set()),
      [],
    );
  });
});

suite('Diff row heights', () => {
  test('gives every row but the error and placeholders a fixed height', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.png b/a.png',
          'Binary files a/a.png and b/a.png differ',
          patch('a.ts', 1),
          '@@ -10,0 +11,1 @@',
          '+line',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      rows.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 28],
        // As tall as a file header, not more for the padding of its message
        ['binary', 28],
        ['file', 28],
        ['line', 20],
        ['hunk', 12],
        ['line', 20],
      ],
    );
    const loading = diffRows([], new Map(), undefined, true);
    assert.deepStrictEqual(
      loading.map((row) => rowHeight(row)),
      [undefined, undefined],
    );
  });
});
