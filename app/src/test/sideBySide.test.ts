import * as assert from 'node:assert';
import { parsePatch } from '../webview/diff';
import {
  changeStarts,
  diffRows,
  minimapRows,
  sideScroll,
  splitRows,
  splitSideClass,
  wheelSideways,
  type DiffRow,
} from '../webview/diffView';

const patch = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,6 +1,6 @@',
  ' one',
  '-two',
  '-three',
  '+2',
  ' four',
  '+five',
  '@@ -20,2 +20,1 @@',
  ' twenty',
  '-gone',
  '',
].join('\n');

function sides(rows: readonly DiffRow[]): string[] {
  return rows.map((row) =>
    row.kind === 'split'
      ? `${row.left?.line.text ?? '·'} | ${row.right?.line.text ?? '·'}`
      : row.kind,
  );
}

suite('Side-by-side diff', () => {
  test('shows unchanged lines on both sides, and pairs removed lines with added ones, filling the shorter side', () => {
    const [file] = parsePatch(patch);
    assert.deepStrictEqual(sides(splitRows(file, 0)), [
      'one | one',
      'two | 2',
      'three | ·',
      'four | four',
      '· | five',
      'hunk',
      'twenty | twenty',
      'gone | ·',
    ]);
  });

  test('numbers each line by its place across the hunks, as the search does', () => {
    const [file] = parsePatch(patch);
    const indices = splitRows(file, 0).flatMap((row) =>
      row.kind === 'split' ? [[row.left?.index, row.right?.index]] : [],
    );
    assert.deepStrictEqual(indices, [
      [0, 0],
      [1, 3],
      [2, undefined],
      [4, 4],
      [undefined, 5],
      [6, 6],
      [7, undefined],
    ]);
  });

  test('lays out a diff side by side only when asked, a file header first as inline', () => {
    const files = parsePatch(patch);
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      rows.slice(0, 3).map((row) => row.kind),
      ['error', 'file', 'split'],
    );
    assert.ok(
      diffRows(files, new Map(), undefined).every(
        (row) => row.kind !== 'split',
      ),
    );
  });

  test('tints the old side of a change as removed and the new side as added, and an empty side as filler', () => {
    const [file] = parsePatch(patch);
    const rows = splitRows(file, 0).filter((row) => row.kind === 'split');
    const classes = rows.map((row) =>
      row.kind === 'split'
        ? [
            splitSideClass(row.left, 'removed'),
            splitSideClass(row.right, 'added'),
          ]
        : [],
    );
    assert.deepStrictEqual(classes.slice(0, 3), [
      ['', ''],
      ['removed', 'added'],
      ['removed', 'filler'],
    ]);
  });

  test('marks changed rows on the minimap and finds where changes start, as inline', () => {
    const files = parsePatch(patch);
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      minimapRows(rows).map((row) => row.change),
      [
        undefined,
        undefined,
        undefined,
        'added',
        'removed',
        undefined,
        'added',
        undefined,
        undefined,
        'removed',
      ],
    );
    assert.deepStrictEqual(
      sides(changeStarts(rows).map((index) => rows[index])),
      ['two | 2', '· | five', 'gone | ·'],
    );
  });

  test('scrolls both sides sideways together, with the wheel held with Shift or a sideways swipe, no further than the widest line', () => {
    assert.strictEqual(
      wheelSideways({ deltaX: 0, deltaY: 30, shiftKey: true }),
      30,
    );
    assert.strictEqual(
      wheelSideways({ deltaX: 20, deltaY: 5, shiftKey: false }),
      20,
    );
    assert.strictEqual(
      wheelSideways({ deltaX: 5, deltaY: 20, shiftKey: false }),
      0,
    );
    assert.strictEqual(sideScroll(0, 30, 100), 30);
    assert.strictEqual(sideScroll(90, 30, 100), 100);
    assert.strictEqual(sideScroll(10, -30, 100), 0);
    assert.strictEqual(sideScroll(0, 30, 0), 0);
  });
});
