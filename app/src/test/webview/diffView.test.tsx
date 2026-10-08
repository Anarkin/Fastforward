import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseFilePatch, parsePatch, type DiffFile } from '../../webview/diff';
import {
  collapseThreshold,
  deferredChanges,
  patchByteBudget,
  patchLineBudget,
  patchPathBudget,
} from '../../shared/protocol';
import { diffSelection, withLargeFiles } from '../../webview/diffColumn';
import {
  changeScrollTop,
  changeStarts,
  codeProps,
  diffRowKey,
  diffRows,
  diffScrollLeft,
  diffScrollTop,
  FileHeader,
  foundScroll,
  HunkDivider,
  largeDiffText,
  largeFilesToLoad,
  lineKeys,
  marked,
  rowHeight,
  rowMeasures,
  anchoredScrollTop,
  rowAnchors,
  scrollAnchor,
  scrollOnToggle,
  showsSideBySide,
  stuckHeader,
  widestColumns,
  type DiffRow,
} from '../../webview/diffView';
import { ImageDiff, imagePanes } from '../../webview/imagePreview';
import { countingReads, fileChange } from '../fixtures';

function patch(path: string, added: number): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${added} @@`,
    ...Array.from({ length: added }, (_, index) => `+line ${index}`),
  ].join('\n');
}

const binaryOf = (path: string) =>
  parsePatch(
    [
      `diff --git a/${path} b/${path}`,
      'index 1111111..2222222 100644',
      `Binary files a/${path} and b/${path} differ`,
    ].join('\n'),
  )[0];

const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

const lines = (files: readonly DiffFile[]) =>
  files.map((file) => [
    file.path,
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  ]);

suite('Diff rows', () => {
  test('lays a file shown entire out inline, even with the side by side layout chosen', () => {
    const whole = { path: 'a.ts', content: 'a', binary: false };
    assert.strictEqual(showsSideBySide(true, undefined), true);
    assert.strictEqual(showsSideBySide(true, whole), false);
    assert.strictEqual(showsSideBySide(false, undefined), false);
  });

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

  test('stands in for a diff that loads while only its files past the budget are known', () => {
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map(), undefined, true)),
      ['error', 'skeleton'],
    );
  });

  test('shows a binary file as such, whole or in a diff, and an image as one', () => {
    const whole = { path: 'a.bin', content: '', binary: true, id: 'a' };
    assert.deepStrictEqual(kinds(diffRows([], new Map(), whole)), [
      'error',
      'file',
      'binary',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([], new Map(), { ...whole, path: 'a.png' })),
      ['error', 'file', 'image'],
    );
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(
        kinds(
          diffRows(
            [binaryOf('a.bin'), binaryOf('a.png')],
            new Map(),
            undefined,
            false,
            sideBySide,
          ),
        ),
        ['error', 'file', 'binary', 'file', 'image'],
      );
    }
    assert.strictEqual(rowHeight({ kind: 'image', file: 0 }), 320);
  });

  test('previews an image on both sides when side by side, hatching the side it lacks, and only on the sides it has inline', () => {
    const [added] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'new file mode 100644',
        `index ${'0'.repeat(40)}..${'2'.repeat(40)}`,
        'Binary files /dev/null and b/a.png differ',
      ].join('\n'),
    );
    const origin = { root: '/repo', hash: 'c'.repeat(40) };
    const shown = (sideBySide: boolean) =>
      imagePanes(origin, added, sideBySide).map((pane) => [
        pane.side,
        pane.url !== undefined,
      ]);
    assert.deepStrictEqual(shown(false), [['new', true]]);
    assert.deepStrictEqual(shown(true), [
      ['old', false],
      ['new', true],
    ]);
    const markup = renderToStaticMarkup(
      <ImageDiff panes={imagePanes(origin, added, true)} />,
    );
    assert.match(
      markup,
      /<div class="image-pane filler"><div class="image-frame"><\/div><\/div>/,
    );
    assert.match(markup, /class="image-pane"/);
  });
});

function sized(...sizes: number[]) {
  let start = 0;
  return sizes.map((size) => {
    const row = { start, size };
    start += size;
    return row;
  });
}

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

  test('defers each large file, and every file once the diff would grow past its budget', () => {
    const fitting = Array.from(
      { length: Math.floor(patchLineBudget / collapseThreshold) },
      (_, index) =>
        fileChange(`${index}.ts`, {
          insertions: collapseThreshold,
          deletions: 0,
        }),
    );
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
  });

  test('keeps a diff of exactly the 20000 changed lines of its budget whole, deferring from the file that passes it', () => {
    const fitting = Array.from(
      { length: Math.floor(patchLineBudget / collapseThreshold) },
      (_, index) =>
        fileChange(`${index}.ts`, {
          insertions: collapseThreshold,
          deletions: 0,
        }),
    );
    const rest = patchLineBudget - fitting.length * collapseThreshold;
    const files = (insertions: number) => [
      ...fitting,
      fileChange('a.ts', { insertions, deletions: 0 }),
      fileChange('b.ts', { insertions: 0, deletions: 0 }),
    ];
    assert.deepStrictEqual([...deferredChanges(files(rest))], []);
    assert.deepStrictEqual(
      [...deferredChanges(files(rest + 1))],
      ['a.ts', 'b.ts'],
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
    const half = patchPathBudget / 2;
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
    const half = patchByteBudget / 2;
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

  test('puts a file deferred for the budget in its place, collapsed until asked for', () => {
    const deferred = 'x'.repeat(patchPathBudget);
    const diff = withLargeFiles(
      parsePatch(patch('a.ts', 1)),
      [fileChange('a.ts'), fileChange(deferred)],
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
      tooLargeToCount: true,
    });
    assert.deepStrictEqual([...deferredChanges([huge])], ['huge.log']);
    const diff = withLargeFiles([], [huge], new Map());
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
    assert.strictEqual(largeDiffText(0), 'Not loaded');
    assert.strictEqual(
      largeDiffText(collapseThreshold + 1),
      `Large diff: ${(collapseThreshold + 1).toLocaleString()} changed lines`,
    );
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

suite('Diff row heights', () => {
  test('gives every row but the error, a large file and placeholders the same fixed height, that of a row of the other columns, so the columns line up', () => {
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
        ['file', 22],
        ['binary', 22],
        ['file', 22],
        ['line', 22],
        ['hunk', 22],
        ['line', 22],
      ],
    );
    const split = diffRows(
      parsePatch(patch('a.ts', 1)),
      new Map(),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(
      split.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 22],
        ['split', 22],
      ],
    );
    const whole = diffRows([], new Map(), {
      path: 'a.ts',
      content: 'a\n',
      binary: false,
    });
    assert.deepStrictEqual(
      whole.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 22],
        ['wholeLine', 22],
      ],
    );
    const [, , large] = diffRows(
      parsePatch(patch('graph.json', collapseThreshold + 1)),
      new Map(),
      undefined,
    );
    assert.strictEqual(large.kind, 'large');
    assert.notStrictEqual(rowHeight(large), 22);
    const loading = diffRows([], new Map(), undefined, true);
    assert.deepStrictEqual(
      loading.map((row) => rowHeight(row)),
      [undefined, undefined],
    );
  });

  test('measures how far the widest line of an inline diff reaches, a tab to its next stop, to widen every row to it', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,2 +1,2 @@',
        ' short',
        '-abcdefghi\tx',
        '+longer line',
      ].join('\n'),
    );
    assert.strictEqual(
      widestColumns(diffRows(files, new Map(), undefined)),
      13,
    );
    assert.strictEqual(
      widestColumns(
        diffRows([], new Map(), {
          path: 'a.ts',
          content: 'a\nbbb\n',
          binary: false,
        }),
      ),
      3,
    );
  });

  test("keys a row by its kind too, so a row of fixed height doesn't take the measured height of a placeholder that was in its place", () => {
    const loading = diffRows([], new Map(), undefined, true);
    const loaded = diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined);
    assert.strictEqual(rowHeight(loading[1]), undefined);
    assert.notStrictEqual(rowHeight(loaded[1]), undefined);
    assert.notStrictEqual(diffRowKey(loading[1], 1), diffRowKey(loaded[1], 1));
  });

  test('keeps the same size and key callbacks while the rows are the same, so the virtualizer measures only from the first changed row', () => {
    const rows = diffRows(parsePatch(patch('a.ts', 2)), new Map(), undefined);
    const same = diffRows(parsePatch(patch('a.ts', 2)), new Map(), undefined);
    const measures = rowMeasures(rows);
    assert.strictEqual(rowMeasures(rows), measures);
    assert.notStrictEqual(rowMeasures(same).getItemKey, measures.getItemKey);
    assert.deepStrictEqual(
      rows.map((_, index) => [
        measures.estimateSize(index),
        measures.getItemKey(index),
      ]),
      [
        [200, '0:error'],
        [22, '1:file'],
        [22, '2:line'],
        [22, '3:line'],
      ],
    );
    const loading = diffRows([], new Map(), undefined, true);
    assert.deepStrictEqual(
      loading.map((_, index) => rowMeasures(loading).estimateSize(index)),
      [200, 240],
    );
  });

  const wrapping = parsePatch(
    [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' one',
      '-one two three',
      '+one two three four five',
    ].join('\n'),
  );

  test('measures the rows of code while wrapping, keeping the height of the others fixed', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    assert.deepStrictEqual(
      rows.map((row) => [row.kind, rowHeight(row, true)]),
      [
        ['error', undefined],
        ['file', 22],
        ['line', undefined],
        ['line', undefined],
        ['line', undefined],
      ],
    );
    const split = diffRows(wrapping, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      split.map((row) => rowHeight(row, true)),
      [undefined, 22, undefined, undefined],
    );
    const whole = diffRows([], new Map(), {
      path: 'a.ts',
      content: 'one\n',
      binary: false,
    });
    assert.deepStrictEqual(
      whole.map((row) => rowHeight(row, true)),
      [undefined, 22, undefined],
    );
  });

  test('estimates a row of code by the rows its text wraps to, a side by side row by its taller side', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    const measures = rowMeasures(rows, { left: 7, right: 7 });
    assert.deepStrictEqual(
      rows.map((_, index) => measures.estimateSize(index)),
      [200, 22, 22, 44, 88],
    );
    const split = diffRows(wrapping, new Map(), undefined, false, true);
    const sides = rowMeasures(split, { left: 13, right: 7 });
    assert.deepStrictEqual(
      split.map((_, index) => sides.estimateSize(index)),
      [200, 22, 22, 88],
    );
  });

  test('keys the rows of code again when the rows or the width they wrap in change, so they are measured again, but no other row', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    const same = diffRows(wrapping, new Map(), undefined);
    const narrow = rowMeasures(rows, { left: 7, right: 7 });
    const wide = rowMeasures(rows, { left: 8, right: 8 });
    const other = rowMeasures(same, { left: 7, right: 7 });
    assert.strictEqual(rowMeasures(rows, { left: 8, right: 8 }), wide);
    for (const measures of [wide, other, rowMeasures(rows)]) {
      assert.notStrictEqual(measures.getItemKey(2), narrow.getItemKey(2));
      assert.strictEqual(measures.getItemKey(1), narrow.getItemKey(1));
    }
  });
});

suite('Scroll anchoring', () => {
  test('finds what the row at the top of the view shows, and how far into it the view starts', () => {
    const rows = sized(22, 22, 22);
    const shown = [['a'], ['b', 'c'], ['d']];
    assert.deepStrictEqual(scrollAnchor(rows, shown, 0), {
      shows: ['a'],
      fraction: 0,
    });
    assert.deepStrictEqual(scrollAnchor(rows, shown, 33), {
      shows: ['b', 'c'],
      fraction: 0.5,
    });
    assert.deepStrictEqual(scrollAnchor(rows, shown, 66), {
      shows: ['d'],
      fraction: 1,
    });
    assert.strictEqual(scrollAnchor([], [], 0), undefined);
  });

  test('scrolls back to the first row showing what was at the top once the rows change, as far into it as before', () => {
    const rows = sized(66, 44, 22);
    const shown = [['a'], ['b'], ['c']];
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b', 'c'], fraction: 0.5 }, rows, shown),
      88,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['a'], fraction: 0 }, rows, shown),
      0,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['x'], fraction: 0 }, rows, shown),
      undefined,
    );
  });

  test('keeps a pixel of the row that was at the top in view, as a row scrolled nearly past it would leave the next one there once it shrinks', () => {
    const rows = sized(22, 22, 22);
    const shown = [['a'], ['b'], ['c']];
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b'], fraction: 219.6 / 220 }, rows, shown),
      22 + 21,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b'], fraction: 1 }, rows, shown),
      22 + 21,
    );
  });

  test('names a line alike inline and side by side, and the headers and hunk gaps by their file and order', () => {
    const files = parsePatch(
      [
        patch('a.ts', 1),
        '@@ -10,1 +11,1 @@',
        '-one two three',
        '+one two three four five',
      ].join('\n'),
    );
    const inlineRows = diffRows(files, new Map(), undefined);
    const splitRows = diffRows(files, new Map(), undefined, false, true);
    const inline = rowAnchors(inlineRows, lineKeys(inlineRows));
    const split = rowAnchors(splitRows, lineKeys(splitRows));
    assert.deepStrictEqual(inline, [
      ['error'],
      ['0:file'],
      ['0:0'],
      ['0:hunk:1'],
      ['0:1'],
      ['0:2'],
    ]);
    assert.deepStrictEqual(split, [
      ['error'],
      ['0:file'],
      ['0:0'],
      ['0:hunk:1'],
      ['0:1', '0:2'],
    ]);
    const added = scrollAnchor(sized(22, 22, 22, 22, 22, 22), inline, 115.5);
    assert.ok(added);
    assert.strictEqual(
      anchoredScrollTop(added, sized(22, 22, 22, 22, 44), split),
      88 + 0.25 * 44,
    );
  });
});

suite('Drawing code', () => {
  test('gives a line the same inputs to draw it from while its colors, changed words and matches stay, so it is not drawn again', () => {
    const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
    const changed = [{ start: 4, end: 7 }];
    const match = { file: 0, line: 1, start: 4, end: 5 };
    const matched = [match];
    const marks = () => ({
      syntax: new Map([['0:1', keyword]]),
      words: new Map([['0:1', changed]]),
      finds: new Map([['0:1', matched]]),
      foundKey: '0:1',
      found: match,
    });
    const before = codeProps(marks(), '0:1', 'let sum', 'removed');
    const after = codeProps(marks(), '0:1', 'let sum', 'removed');
    assert.deepStrictEqual(
      Object.entries(after).map(([name, value]) => [name, value]),
      Object.entries(before),
    );
    assert.ok(
      Object.values(after).every(
        (value, index) => Object.values(before)[index] === value,
      ),
    );
    assert.strictEqual(before.wordClass, 'word-removed');
    assert.strictEqual(before.current, match);
    const plain = codeProps(marks(), '0:2', 'x', 'added');
    const again = codeProps(marks(), undefined, 'x', undefined);
    assert.deepStrictEqual(plain.syntax, []);
    assert.strictEqual(again.syntax, plain.syntax);
    assert.strictEqual(again.words, plain.words);
    assert.strictEqual(again.finds, plain.finds);
    assert.strictEqual(plain.current, undefined);
    assert.strictEqual(plain.wordClass, 'word-added');
  });

  test('draws the changed words inside the line, with search matches over them', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'let sum = 1',
          [],
          [{ start: 4, end: 7 }],
          'word-added',
          [{ start: 5, end: 9 }],
          { start: 5, end: 9 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      'let <span class="word-added">s</span><span class="word-added"><mark class="find-match current">um</mark></span><mark class="find-match current"> =</mark> 1',
    );
  });

  test('marks a line dense with colors, changed words and matches piece by piece in one pass', () => {
    const pairs = 2000;
    const text = 'ab'.repeat(pairs);
    const every = (offset: number) =>
      Array.from({ length: pairs }, (_, pair) => ({
        start: 2 * pair + offset,
        end: 2 * pair + offset + 1,
      }));
    const colors = every(0).map((range) => ({
      ...range,
      kind: 'keyword' as const,
    }));
    const syntax = countingReads(colors);
    const words = countingReads(every(1));
    const matches = countingReads(every(1));
    const drawn = marked(
      text,
      syntax.counted,
      words.counted,
      'word-added',
      matches.counted,
      undefined,
    );
    for (const { reads } of [syntax, words, matches]) {
      assert.ok(reads <= 10 * pairs, `${reads} reads of ${pairs} ranges`);
    }
    assert.ok(Array.isArray(drawn));
    assert.strictEqual(drawn.length, 2 * pairs);
    assert.strictEqual(
      renderToStaticMarkup(<>{drawn.slice(-2)}</>),
      '<span class="syntax-keyword">a</span><span class="word-added"><mark class="find-match ">b</mark></span>',
    );
  });

  test('draws the syntax colors inside the changed words, under the search matches', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          {marked(
            'let sum = 1',
            [
              { start: 0, end: 3, kind: 'keyword' },
              { start: 10, end: 11, kind: 'number' },
            ],
            [{ start: 0, end: 7 }],
            'word-added',
            [{ start: 2, end: 5 }],
            undefined,
          )}
        </>,
      ),
      '<span class="word-added"><span class="syntax-keyword">le</span></span>' +
        '<span class="word-added"><span class="syntax-keyword"><mark class="find-match ">t</mark></span></span>' +
        '<span class="word-added"><mark class="find-match "> s</mark></span>' +
        '<span class="word-added">um</span> = <span class="syntax-number">1</span>',
    );
  });

  test('marks the matches in a line, the current one apart', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'find a find',
          [],
          [],
          'word-added',
          [
            { start: 0, end: 4 },
            { start: 7, end: 11 },
          ],
          { start: 7, end: 11 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      '<mark class="find-match ">find</mark> a <mark class="find-match current">find</mark>',
    );
    assert.strictEqual(
      marked('plain', [], [], 'word-added', [], undefined),
      'plain',
    );
  });
});

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, leaving it to move between the columns only then', () => {
    assert.strictEqual(diffScrollLeft(-1, 100), 60);
    assert.strictEqual(diffScrollLeft(-1, 20), 0);
    assert.strictEqual(diffScrollLeft(-1, 0), undefined);
    assert.strictEqual(diffScrollLeft(1, 100), undefined);
  });

  test('scrolls the sides of a side by side diff right with the right arrow too, no further than the widest line, as nothing else scrolls them', () => {
    assert.strictEqual(diffScrollLeft(1, 0, 100), 40);
    assert.strictEqual(diffScrollLeft(1, 80, 100), 100);
    assert.strictEqual(diffScrollLeft(1, 100, 100), undefined);
    assert.strictEqual(diffScrollLeft(1, 0, 0), undefined);
    assert.strictEqual(diffScrollLeft(-1, 100, 100), 60);
  });

  test('scrolls three lines with the arrows, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000), 166);
    assert.strictEqual(diffScrollTop('up', 40, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000), 478);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('first', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('last', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('last', 0, 400, 300), 0);
  });
});

suite('Jumping between changes', () => {
  test('finds where each run of added or removed lines starts', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.ts b/a.ts',
          '--- a/a.ts',
          '+++ b/a.ts',
          '@@ -1,6 +1,6 @@',
          ' one',
          '-two',
          '+2',
          ' three',
          ' four',
          '+five',
          '',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      changeStarts(rows).map((index) => rows[index]),
      [
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'removed',
            oldNumber: 2,
            newNumber: undefined,
            text: 'two',
          },
        },
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'added',
            oldNumber: undefined,
            newNumber: 5,
            text: 'five',
          },
        },
      ],
    );
  });

  test('scrolls to the next or previous change below the header and some context, and no further at either end', () => {
    const starts = [100, 500, 900];
    assert.strictEqual(changeScrollTop(starts, 0, 1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, 1, 60), 440);
    assert.strictEqual(changeScrollTop(starts, 440, -1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, -1, 60), undefined);
    assert.strictEqual(changeScrollTop(starts, 840, 1, 60), undefined);
    assert.strictEqual(changeScrollTop([30], 100, -1, 60), 0);
  });
});

const longLine = (kind: 'context' | 'added' | 'removed') => ({
  kind,
  oldNumber: 1,
  newNumber: 1,
  text: 'a'.repeat(400),
});

const foundOn = (line: number) => ({ file: 0, line, start: 300, end: 304 });

suite('Diff sideways scrolling', () => {
  test('scrolls sideways to a found match hidden past an edge of the side it is on', () => {
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const inline: DiffRow = { kind: 'line', file: 0, line: longLine('added') };
    assert.strictEqual(foundScroll(inline, foundOn(3), view, 8), 2254);
    const whole: DiffRow = {
      kind: 'wholeLine',
      file: 0,
      number: 4,
      text: 'a'.repeat(400),
    };
    assert.strictEqual(foundScroll(whole, foundOn(3), view, 8), 2198);
    const changed: DiffRow = {
      kind: 'split',
      file: 0,
      left: { index: 2, line: longLine('removed') },
      right: { index: 3, line: longLine('added') },
    };
    assert.strictEqual(foundScroll(changed, foundOn(2), view, 8), 2122);
    assert.strictEqual(foundScroll(changed, foundOn(3), view, 8), 2142);
    const cell = { index: 3, line: longLine('context') };
    const context: DiffRow = {
      kind: 'split',
      file: 0,
      left: cell,
      right: cell,
    };
    assert.strictEqual(foundScroll(context, foundOn(3), view, 8), 2142);
    assert.strictEqual(
      foundScroll(inline, { ...foundOn(3), start: 10, end: 14 }, view, 8),
      0,
    );
    assert.strictEqual(
      foundScroll(
        inline,
        { ...foundOn(3), start: 0, end: 4 },
        { ...view, scrolled: 2000 },
        8,
      ),
      0,
    );
    assert.strictEqual(
      foundScroll({ kind: 'hunk', file: 0 }, foundOn(3), view, 8),
      undefined,
    );
  });
});

suite('Hunk divider', () => {
  test('marks the lines left out between hunks with dots', () => {
    assert.strictEqual(
      renderToStaticMarkup(<HunkDivider />),
      '<div class="hunk-divider"><span class="hunk-dots">⋯</span></div>',
    );
  });
});

suite('Diff file header', () => {
  test('labels a file shown entire as unchanged, naming no commit, as it may be in the uncommitted changes or a comparison', () => {
    const html = renderToStaticMarkup(
      <FileHeader path="a.ts" open whole onClick={() => {}} />,
    );
    assert.match(html, /<span class="unchanged">Unchanged<\/span>/);
    assert.doesNotMatch(html, /commit/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader path="a.ts" open whole={false} onClick={() => {}} />,
      ),
      /unchanged/,
    );
  });
});
