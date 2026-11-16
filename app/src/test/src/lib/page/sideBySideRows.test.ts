import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch, type DiffFile } from '../../../../lib/page/diff';
import {
  diffRows,
  lineKeys,
  type DiffRow,
} from '../../../../lib/page/diffRows';
import {
  splitRows,
  showsSideBySide,
  splitPairs,
} from '../../../../lib/page/sideBySideRows';
import { changeStarts } from '../../../../lib/page/diffScrolling';
import { minimapRows } from '../../../../lib/page/rowMeasures';
import { splitSideClass } from '../../../../lib/page/diffRowClasses';
import { sideBySideWords } from '../../../../lib/page/pairing';
import { wordRanges } from '../../../../lib/page/wordDiff';
import { lineKey } from '../../../../lib/page/diffLines';

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

const u = undefined;

function patchOf(...lines: string[]): string {
  return [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    `@@ -1,${lines.length} +1,${lines.length} @@`,
    ...lines,
    '',
  ].join('\n');
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

  test('lines up the sides of each file once, keeping them as other files open and close or the file moves', () => {
    const [file] = parsePatch(patch);
    const other = parsePatch(patch.replaceAll('a.ts', 'b.ts'))[0];
    const split = (toggled: ReadonlyMap<string, boolean>) =>
      diffRows([file, other], toggled, undefined, false, true).filter(
        (row) => row.kind === 'split' && row.file === 0,
      );
    const rows = split(new Map());
    assert.strictEqual(rows.length, 7);
    const closed = split(new Map([['b.ts', false]]));
    rows.forEach((row, index) => assert.strictEqual(closed[index], row));
    const moved = splitRows(file, 1);
    assert.deepStrictEqual(sides(moved), sides(splitRows(file, 0)));
    assert.ok(moved.every((row) => row.file === 1));
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

  test('lays out side by side a file with more rows than a call takes arguments, as one shown entire can have', () => {
    const lines = 200_000;
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        `@@ -1,${lines} +1,${lines} @@`,
        ...Array.from({ length: lines }, (_, index) => ` ${index}`),
      ].join('\n'),
    );
    assert.strictEqual(
      diffRows(files, new Map(), undefined, false, true).length,
      2 + lines,
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
});

suite('Side-by-side rows with matched lines', () => {
  const file = parsePatch(
    patchOf(
      ' keep',
      '-const total = a + b;',
      '+// new',
      '+// lines',
      '+const sum = a + b + c;',
      ' keep',
    ),
  );

  test('places the matched lines on one row, the inserted ones across from filler', () => {
    assert.deepStrictEqual(sides(splitRows(file[0], 0)), [
      'keep | keep',
      '· | // new',
      '· | // lines',
      'const total = a + b; | const sum = a + b + c;',
      'keep | keep',
    ]);
  });

  test('keeps each line numbered by its place, as the search counts lines', () => {
    const indices = splitRows(file[0], 0).flatMap((row) =>
      row.kind === 'split' ? [[row.left?.index, row.right?.index]] : [],
    );
    assert.deepStrictEqual(indices, [
      [0, 0],
      [u, 2],
      [u, 3],
      [1, 4],
      [5, 5],
    ]);
  });

  test('keys each row by its lines, so search finds them where they are shown', () => {
    const rows = diffRows(file, new Map(), undefined, false, true);
    assert.deepStrictEqual(lineKeys(rows).slice(2), [
      ['0:0'],
      ['0:2'],
      ['0:3'],
      ['0:1', '0:4'],
      ['0:5'],
    ]);
  });

  test('starts one change at the first inserted line, the matched pair continuing it', () => {
    const rows = diffRows(file, new Map(), undefined, false, true);
    assert.deepStrictEqual(sides(changeStarts(rows).map((i) => rows[i])), [
      '· | // new',
    ]);
  });

  test('marks the matched and inserted rows as added on the minimap', () => {
    const rows = diffRows(file, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      minimapRows(rows)
        .slice(2)
        .map((row) => row.change),
      [u, 'added', 'added', 'added', u],
    );
  });

  test('aligns each change block on its own, never across unchanged lines', () => {
    const files = parsePatch(
      patchOf(
        '-let first = 1;',
        '+// header',
        ' keep',
        '-let other = 1;',
        '+let first = 2;',
      ),
    );
    assert.deepStrictEqual(sides(splitRows(files[0], 0)), [
      'let first = 1; | // header',
      'keep | keep',
      'let other = 1; | let first = 2;',
    ]);
  });

  test('aligns each hunk on its own', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,1 +1,2 @@',
        '-let total = 1;',
        '+// new',
        '+let sum = 1;',
        '@@ -10,1 +11,1 @@',
        '-done();',
        '+done(now);',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(sides(splitRows(files[0], 0)), [
      '· | // new',
      'let total = 1; | let sum = 1;',
      'hunk',
      'done(); | done(now);',
    ]);
  });

  test('aligns removed lines that follow added ones as a block of their own', () => {
    const files = parsePatch(
      patchOf('+let sum = 1;', '-let total = 1;', '-other();'),
    );
    assert.deepStrictEqual(sides(splitRows(files[0], 0)), [
      '· | let sum = 1;',
      'let total = 1; | ·',
      'other(); | ·',
    ]);
  });

  test('leaves the inline layout as it was', () => {
    const rows = diffRows(file, new Map(), undefined);
    assert.ok(rows.every((row) => row.kind !== 'split'));
    assert.deepStrictEqual(
      rows.flatMap((row) => (row.kind === 'line' ? [row.line.text] : [])),
      [
        'keep',
        'const total = a + b;',
        '// new',
        '// lines',
        'const sum = a + b + c;',
        'keep',
      ],
    );
  });
});

function budgetedFiles() {
  const lineCount = 150;
  const wordCount = 20;
  const line = (name: string) =>
    Array.from({ length: wordCount }, (_, word) => `${name}w${word}`).join(' ');
  const removed = Array.from({ length: lineCount }, (_, index) =>
    line(`l${index}`),
  );
  const added = [line('inserted'), ...removed];
  const files = parsePatch(
    Array.from({ length: 8 }, (_, file) =>
      [
        `diff --git a/${file}.txt b/${file}.txt`,
        `--- a/${file}.txt`,
        `+++ b/${file}.txt`,
        `@@ -1,${removed.length} +1,${added.length} @@`,
        ...removed.map((text) => `-${text}`),
        ...added.map((text) => `+${text}`),
      ].join('\n'),
    ).join('\n'),
  );
  const perChange =
    removed.length * wordCount * added.length +
    added.length * wordCount * removed.length;
  return { files, aligned: Math.floor(sideBySideWords / perChange) };
}

function filesStartingAligned(
  files: readonly DiffFile[],
  rows: readonly DiffRow[],
): boolean[] {
  return files.map((_, file) => {
    const first = rows.find((row) => row.kind === 'split' && row.file === file);
    return first?.kind === 'split' && first.left === undefined;
  });
}

suite('Diff rows', () => {
  test('lines up the changes of a side by side diff by their words only until comparing them passes a limit for the whole diff, pairing the rest in order, as side by side pairs every block before the diff is drawn', () => {
    const { files, aligned } = budgetedFiles();
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.ok(aligned > 0 && aligned < 8);
    assert.deepStrictEqual(
      filesStartingAligned(files, rows),
      Array.from({ length: 8 }, (_, file) => file < aligned),
    );
  });

  test('lays a side by side diff out the same each time, counting the changes lined up before toward the limit, so laying it out again, as for a file toggled, moves no rows', () => {
    const { files, aligned } = budgetedFiles();
    const expected = Array.from({ length: 8 }, (_, file) => file < aligned);
    const first = diffRows(files, new Map(), undefined, false, true);
    const again = diffRows(files, new Map(), undefined, false, true);
    const toggled = diffRows(
      files,
      new Map([[files[0].path, true]]),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(filesStartingAligned(files, first), expected);
    assert.deepStrictEqual(filesStartingAligned(files, again), expected);
    assert.deepStrictEqual(filesStartingAligned(files, toggled), expected);
  });

  test('lays a side by side diff out by the limit after its words were marked, and marks them as the lines it lays out are paired', () => {
    const { files, aligned } = budgetedFiles();
    const last = files.length - 1;
    const words = wordRanges(files);
    words.get(lineKey(last, 0));
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      filesStartingAligned(files, rows),
      Array.from({ length: 8 }, (_, file) => file < aligned),
    );
    const wordsLaidOut = wordRanges(files, splitPairs(rows));
    const [firstRow] = rows.filter(
      (row) => row.kind === 'split' && row.file === last,
    );
    assert.ok(firstRow?.kind === 'split' && firstRow.left && firstRow.right);
    assert.strictEqual(firstRow.right.line.text.startsWith('inserted'), true);
    assert.strictEqual(
      wordsLaidOut.get(lineKey(last, firstRow.left.index)),
      'whole',
    );
    assert.strictEqual(
      wordsLaidOut.get(lineKey(last, firstRow.right.index)),
      'whole',
    );
  });

  test('lays a file shown entire out inline, even with the side by side layout chosen', () => {
    const whole = { path: 'a.ts', content: 'a', binary: false };
    assert.strictEqual(showsSideBySide(true, undefined), true);
    assert.strictEqual(showsSideBySide(true, whole), false);
    assert.strictEqual(showsSideBySide(false, undefined), false);
  });
});
