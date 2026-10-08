import * as assert from 'node:assert';
import { parsePatch } from '../../webview/diff';
import {
  changeStarts,
  diffRows,
  lineKeys,
  minimapRows,
  sideScroll,
  splitRows,
  splitSideClass,
  wheelGlide,
  wheelSideways,
  type DiffRow,
} from '../../webview/diffView';
import { glideAt, glideBy, glideEnded } from '../../webview/glide';
import { noModifiers } from '../fixtures';

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

  test('scrolls both sides sideways together, gliding with the wheel held with Shift, at once with a sideways swipe', () => {
    assert.deepStrictEqual(
      wheelSideways({ deltaX: 0, deltaY: 30, ...noModifiers, shiftKey: true }),
      { delta: 30, duration: wheelGlide },
    );
    assert.deepStrictEqual(
      wheelSideways({ deltaX: 20, deltaY: 5, ...noModifiers, shiftKey: false }),
      { delta: 20, duration: 0 },
    );
    assert.strictEqual(
      wheelSideways({ deltaX: 5, deltaY: 20, ...noModifiers, shiftKey: false })
        .delta,
      0,
    );
  });

  test('glides sideways to where a wheel tick leads, easing out', () => {
    const glide = glideBy(undefined, 0, 1000, 100, 120, 500);
    assert.strictEqual(glideAt(glide, 1000), 0);
    const halfway = glideAt(glide, 1060);
    assert.ok(halfway > 50 && halfway < 100, `${halfway}`);
    assert.strictEqual(glideAt(glide, 1120), 100);
    assert.strictEqual(glideAt(glide, 2000), 100);
    assert.ok(!glideEnded(glide, 1119));
    assert.ok(glideEnded(glide, 1120));
  });

  test('glides on from where it is to further along, as wheel ticks come during a glide', () => {
    const first = glideBy(undefined, 0, 0, 100, 120, 500);
    const second = glideBy(first, 0, 60, 100, 120, 500);
    assert.strictEqual(second.from, glideAt(first, 60));
    assert.strictEqual(second.to, 200);
    assert.strictEqual(glideAt(second, 60), glideAt(first, 60));
    assert.strictEqual(glideAt(second, 180), 200);
  });

  test('stops each wheel tick in turn at either end, no further than the widest line', () => {
    const right = glideBy(undefined, 90, 0, 30, 120, 100);
    assert.strictEqual(right.to, 100);
    assert.strictEqual(glideBy(right, 90, 0, -30, 120, 100).to, 70);
    assert.strictEqual(glideBy(undefined, 10, 0, -30, 120, 100).to, 0);
    assert.strictEqual(glideBy(undefined, 0, 0, 30, 120, 0).to, 0);
  });

  test('moves at once by a swipe', () => {
    const glide = glideBy(undefined, 40, 1000, 20, 0, 100);
    assert.strictEqual(glideAt(glide, 1000), 60);
    assert.ok(glideEnded(glide, 1000));
  });

  test('keeps the sideways scroll within the widest line shown, once narrower lines replace wider ones', () => {
    assert.strictEqual(sideScroll(800, 0), 0);
    assert.strictEqual(sideScroll(800, 300), 300);
    assert.strictEqual(sideScroll(50, 300), 50);
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
