import * as assert from 'node:assert';
import { parseFilePatch, parsePatch, type DiffFile } from '../webview/diff';
import { collapseThreshold } from '../shared/protocol';
import { withLargeFiles } from '../webview/diffColumn';
import {
  diffRowKey,
  diffRows,
  largeFilesToLoad,
  rowHeight,
  scrollOnToggle,
  stuckHeader,
  type DiffRow,
} from '../webview/diffView';
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

const lines = (files: readonly DiffFile[]) =>
  files.map((file) => [
    file.path,
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  ]);

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

  test('divides the changed parts of a file with a plain line, leaving out the function git guesses they are in', () => {
    const files = parsePatch(
      [patch('a.ts', 1), '@@ -10,0 +11,1 @@ function f()', '+line'].join('\n'),
    );
    const rows = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'line',
      'hunk',
      'line',
    ]);
    assert.deepStrictEqual(rows[3], { kind: 'hunk', file: 0 });
  });

  test('collapses a large file, and opens it when asked', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    const collapsed = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(collapsed), ['error', 'file', 'large']);
    assert.deepStrictEqual(collapsed[2], {
      kind: 'large',
      file: 0,
      path: 'graph.json',
      lines: collapseThreshold + 1,
    });

    const opened = diffRows(files, new Map([['graph.json', true]]), undefined);
    assert.strictEqual(opened.length, 2 + collapseThreshold + 1);

    const closed = diffRows(files, new Map([['graph.json', false]]), undefined);
    assert.deepStrictEqual(kinds(closed), ['error', 'file']);
  });

  test('counts only changed lines toward collapsing a file', () => {
    const files = parsePatch(
      [patch('a.ts', collapseThreshold), ' one', ' two', ' three'].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      ...Array<string>(collapseThreshold + 3).fill('line'),
    ]);
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
    const unterminated = diffRows([], new Map(), {
      path: 'README.md',
      content: 'one\ntwo',
      binary: false,
    });
    assert.deepStrictEqual(
      unterminated.map((row) => row.kind === 'wholeLine' && row.number),
      [false, false, 1, 2],
    );
  });

  test('lays out an empty whole file without lines', () => {
    const rows = diffRows([], new Map(), {
      path: '.gitkeep',
      content: '',
      binary: false,
    });
    assert.deepStrictEqual(kinds(rows), ['error', 'file']);
  });

  test('keeps what it shows while the next one loads, and shows a placeholder only in place of nothing', () => {
    assert.deepStrictEqual(
      kinds(diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined, true)),
      ['error', 'file', 'line'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [],
          new Map(),
          { path: 'a', content: 'x\n', binary: false },
          true,
        ),
      ),
      ['error', 'file', 'wholeLine'],
    );
  });
});

function laidOut(rows: readonly DiffRow[]) {
  let start = 0;
  return rows.map((row, index) => {
    const item = { index, start, end: start + (rowHeight(row) ?? 100) };
    start = item.end;
    return item;
  });
}

suite('Stuck file header', () => {
  const files = parsePatch(`${patch('a.ts', 3)}\n${patch('b.ts', 3)}`);
  const rows = diffRows(files, new Map(), undefined);
  const items = laidOut(rows);
  const start = (index: number) => items[index].start;

  test('sticks the header of the file whose line is on top', () => {
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'line',
      'line',
      'line',
      'file',
      'line',
      'line',
      'line',
    ]);
    assert.strictEqual(stuckHeader(rows, items, start(7) + 1), rows[5]);
    assert.strictEqual(stuckHeader(rows, items, start(5) + 1), rows[5]);
  });

  test('sticks nothing while a header is whole in its place, or no file is on top', () => {
    assert.strictEqual(stuckHeader(rows, items, start(5)), undefined);
    assert.strictEqual(stuckHeader(rows, items, 0), undefined);
    assert.strictEqual(stuckHeader(rows, items, start(1)), undefined);
  });

  test('sticks the header of a whole file too', () => {
    const whole = diffRows([], new Map(), {
      path: 'README.md',
      content: 'a\nb\nc\n',
      binary: false,
    });
    const wholeItems = laidOut(whole);
    assert.strictEqual(
      stuckHeader(whole, wholeItems, wholeItems[3].start),
      whole[1],
    );
  });

  test('scrolls to the header of a file closed from its stuck header, and nowhere otherwise', () => {
    const closed = diffRows(files, new Map([['b.ts', false]]), undefined);
    const closedHeader = closed[5];
    const openHeader = rows[5];
    assert.ok(closedHeader.kind === 'file' && openHeader.kind === 'file');
    assert.strictEqual(scrollOnToggle(closed, closedHeader, true), 5);
    assert.strictEqual(scrollOnToggle(rows, openHeader, false), undefined);
  });

  test('stands in for a diff that loads, and a large file being fetched', () => {
    assert.deepStrictEqual(kinds(diffRows([], new Map(), undefined, true)), [
      'error',
      'skeleton',
    ]);
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    assert.deepStrictEqual(kinds(diffRows([large], new Map(), undefined)), [
      'error',
      'file',
      'large',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map([['graph.json', true]]), undefined)),
      ['error', 'file', 'skeletonLines'],
    );
  });

  test('shows a binary file as such, whole or in a diff', () => {
    assert.deepStrictEqual(
      kinds(
        diffRows([], new Map(), { path: 'a.png', content: '', binary: true }),
      ),
      ['error', 'file', 'binary'],
    );
    const [binary] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'index 1111111..2222222 100644',
        'Binary files a/a.png and b/a.png differ',
      ].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows([binary], new Map(), undefined)), [
      'error',
      'file',
      'binary',
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

  test('keeps both halves of a file that changed type', () => {
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
    const both = [['f', ['hello', 'target']]];
    const parsed = parsePatch(typeChange);
    assert.deepStrictEqual(lines(parsed), both);
    assert.deepStrictEqual(
      lines(withLargeFiles(parsed, [fileChange('f')], new Map())),
      both,
    );
    assert.deepStrictEqual(lines([parseFilePatch('f', typeChange)]), both);
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

  test("keys a row by its kind too, so a row of fixed height doesn't take the measured height of a placeholder that was in its place", () => {
    const loading = diffRows([], new Map(), undefined, true);
    const loaded = diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined);
    assert.strictEqual(rowHeight(loading[1]), undefined);
    assert.notStrictEqual(rowHeight(loaded[1]), undefined);
    assert.notStrictEqual(diffRowKey(loading[1], 1), diffRowKey(loaded[1], 1));
  });
});
