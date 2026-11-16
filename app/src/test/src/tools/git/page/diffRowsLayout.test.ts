import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { collapseThreshold } from '../../../../../components/diff/shared/patchBudget';
import { patch, kinds } from './diffViewFixtures';
import { diffRows } from '../../../../../components/diff/page/diffRows';
import { rowHeight } from '../../../../../components/diff/page/rowMeasures';

const binaryOf = (path: string) =>
  parsePatch(
    [
      `diff --git a/${path} b/${path}`,
      'index 1111111..2222222 100644',
      `Binary files a/${path} and b/${path} differ`,
    ].join('\n'),
  )[0];

const headers = (rows: ReturnType<typeof diffRows>) =>
  rows.flatMap((row) => (row.kind === 'file' ? [row.collapsible] : []));

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

    const closed = diffRows(
      parsePatch(
        [patch('graph.json', collapseThreshold + 1), patch('a.ts', 1)].join(
          '\n',
        ),
      ),
      new Map([['graph.json', false]]),
      undefined,
    );
    assert.deepStrictEqual(kinds(closed), ['error', 'file', 'file', 'line']);
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
    const files = parsePatch([patch('a.ts', 2), patch('b.ts', 1)].join('\n'));
    const rows = diffRows(files, new Map([['a.ts', false]]), undefined);
    assert.deepStrictEqual(kinds(rows), ['error', 'file', 'file', 'line']);
  });

  test('lets a file collapse only among others, as a file shown alone has nothing to make room for', () => {
    const pair = parsePatch([patch('a.ts', 1), patch('b.ts', 1)].join('\n'));
    assert.deepStrictEqual(headers(diffRows(pair, new Map(), undefined)), [
      true,
      true,
    ]);
    assert.deepStrictEqual(
      headers(diffRows(pair.slice(0, 1), new Map(), undefined)),
      [false],
    );
    assert.deepStrictEqual(
      headers(
        diffRows([], new Map(), {
          path: 'README.md',
          content: 'a\n',
          binary: false,
        }),
      ),
      [false],
    );
  });

  test('keeps a file shown alone open though it was closed among others, as alone it has no way to open again', () => {
    const files = parsePatch(patch('a.ts', 2));
    assert.deepStrictEqual(
      kinds(diffRows(files, new Map([['a.ts', false]]), undefined)),
      ['error', 'file', 'line', 'line'],
    );
  });

  test('still offers to show a large file shown alone that was closed among others', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    assert.deepStrictEqual(
      kinds(diffRows(files, new Map([['graph.json', false]]), undefined)),
      ['error', 'file', 'large'],
    );
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
    assert.strictEqual(rowHeight({ kind: 'image', file: 0 }), 19 * 22);
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
