import * as assert from 'node:assert';
import { parsePatch } from '../webview/diff';
import { collapseThreshold, diffRows } from '../webview/diffView';

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
      'summary',
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
      'summary',
      'file',
      'line',
      'hunk',
      'line',
    ]);
  });

  test('collapses a large file, and opens it when asked', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    const collapsed = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(collapsed), ['summary', 'file', 'large']);

    const opened = diffRows(files, new Map([['graph.json', true]]), undefined);
    assert.strictEqual(opened.length, 2 + collapseThreshold + 1);
  });

  test('closes a small file when asked', () => {
    const files = parsePatch(patch('a.ts', 2));
    const rows = diffRows(files, new Map([['a.ts', false]]), undefined);
    assert.deepStrictEqual(kinds(rows), ['summary', 'file']);
  });

  test('lays out a whole file line by line', () => {
    const rows = diffRows([], new Map(), {
      path: 'README.md',
      content: 'one\ntwo\n',
      binary: false,
    });
    assert.deepStrictEqual(kinds(rows), [
      'summary',
      'file',
      'wholeLine',
      'wholeLine',
    ]);
  });
});
