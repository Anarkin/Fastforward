import * as assert from 'node:assert';
import { parsePatch } from '../webview/diff';
import {
  changeStarts,
  diffRows,
  lineKeys,
  minimapRows,
  splitRows,
  type DiffRow,
} from '../webview/diffView';
import {
  alignLines,
  lineSimilarity,
  similarEnough,
  type LinePair,
} from '../webview/pairing';

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

function sides(rows: readonly DiffRow[]): string[] {
  return rows.flatMap((row) =>
    row.kind === 'split'
      ? [`${row.left?.line.text ?? '·'} | ${row.right?.line.text ?? '·'}`]
      : row.kind === 'hunk'
        ? ['hunk']
        : [],
  );
}

function shown(removed: readonly string[], added: readonly string[]): string[] {
  return alignLines(removed, added).map(
    ([left, right]) =>
      `${left === u ? '·' : removed[left]} | ${right === u ? '·' : added[right]}`,
  );
}

suite('Line similarity', () => {
  test('scores lines that are the same as 1', () => {
    assert.strictEqual(lineSimilarity('const a = 1;', 'const a = 1;'), 1);
  });

  test('scores lines sharing no word as 0', () => {
    assert.strictEqual(lineSimilarity('alpha beta', 'gamma delta'), 0);
  });

  test('ignores spacing, so a reindented line is the same', () => {
    assert.strictEqual(lineSimilarity('  return x;', '        return   x;'), 1);
  });

  test('scores two blank lines as just similar enough to line up, so they never outweigh a real match, and a blank line as unlike any text', () => {
    assert.strictEqual(lineSimilarity('', '   '), similarEnough);
    assert.strictEqual(lineSimilarity('', 'x'), 0);
    assert.strictEqual(lineSimilarity('x', '  '), 0);
  });

  test('scores the share of words in common, counted from both lines', () => {
    assert.strictEqual(
      lineSimilarity('const total = a + b;', 'const sum = a + b + c;'),
      0.75,
    );
    assert.strictEqual(lineSimilarity('a b', 'a c'), 0.5);
    assert.strictEqual(lineSimilarity('a', 'a b c'), 0.5);
  });

  test('counts a repeated word only as often as both lines have it', () => {
    assert.strictEqual(lineSimilarity('a a a', 'a'), 0.5);
    assert.strictEqual(lineSimilarity('a a', 'a a'), 1);
  });

  test('scores the same either way round', () => {
    for (const [a, b] of [
      ['const total = a + b;', 'const sum = a + b + c;'],
      ['a a a', 'a'],
      ['<div className="menu">', 'className="menu"'],
    ]) {
      assert.strictEqual(lineSimilarity(a, b), lineSimilarity(b, a));
    }
  });

  test('tells words apart by case and punctuation', () => {
    assert.strictEqual(lineSimilarity('Total', 'total'), 0);
    assert.strictEqual(lineSimilarity('f(x)', 'f[x]'), 0.5);
  });
});

suite('Aligning a change side by side', () => {
  test('aligns nothing when there is nothing', () => {
    assert.deepStrictEqual(alignLines([], []), []);
  });

  test('leaves the other side empty when lines were only removed or only added', () => {
    assert.deepStrictEqual(alignLines(['a', 'b'], []), [
      [0, u],
      [1, u],
    ]);
    assert.deepStrictEqual(alignLines([], ['a', 'b']), [
      [u, 0],
      [u, 1],
    ]);
  });

  test('puts each edited line next to what it became, in order', () => {
    assert.deepStrictEqual(
      shown(
        ['let total = 1;', 'let count = 2;'],
        ['let sum = 1;', 'let count = 3;'],
      ),
      ['let total = 1; | let sum = 1;', 'let count = 2; | let count = 3;'],
    );
  });

  test('still puts unrelated replacements side by side in order, as before', () => {
    assert.deepStrictEqual(shown(['two', 'three'], ['2']), [
      'two | 2',
      'three | ·',
    ]);
    assert.deepStrictEqual(shown(['x'], ['y', 'z']), ['x | y', '· | z']);
  });

  test('leaves lines inserted before an edited line across from nothing', () => {
    assert.deepStrictEqual(
      shown(
        ['const total = a + b;'],
        ['// new', '// lines', 'const sum = a + b + c;'],
      ),
      [
        '· | // new',
        '· | // lines',
        'const total = a + b; | const sum = a + b + c;',
      ],
    );
  });

  test('leaves lines inserted after an edited line across from nothing', () => {
    assert.deepStrictEqual(
      shown(
        ['const total = a + b;'],
        ['const sum = a + b + c;', '// new', '// lines'],
      ),
      [
        'const total = a + b; | const sum = a + b + c;',
        '· | // new',
        '· | // lines',
      ],
    );
  });

  test('leaves lines removed before an edited line across from nothing', () => {
    assert.deepStrictEqual(
      shown(['// old', '// notes', 'let total = 1;'], ['let sum = 1;']),
      ['// old | ·', '// notes | ·', 'let total = 1; | let sum = 1;'],
    );
  });

  test('lines up edited lines on both sides of an inserted one', () => {
    assert.deepStrictEqual(
      shown(
        ['let first = 1;', 'let last = 9;'],
        ['let first = 2;', 'log(first);', 'let last = 8;'],
      ),
      [
        'let first = 1; | let first = 2;',
        '· | log(first);',
        'let last = 9; | let last = 8;',
      ],
    );
  });

  test('lines up edited lines on both sides of a removed one', () => {
    assert.deepStrictEqual(
      shown(
        ['let first = 1;', 'log(first);', 'let last = 9;'],
        ['let first = 2;', 'let last = 8;'],
      ),
      [
        'let first = 1; | let first = 2;',
        'log(first); | ·',
        'let last = 9; | let last = 8;',
      ],
    );
  });

  test('puts unrelated lines between two matches side by side, rather than apart', () => {
    assert.deepStrictEqual(
      shown(
        ['let first = 1;', 'removed()', 'let last = 9;'],
        ['let first = 2;', 'added()', 'let last = 8;'],
      ),
      [
        'let first = 1; | let first = 2;',
        'removed() | added()',
        'let last = 9; | let last = 8;',
      ],
    );
  });

  test('keeps both sides in order, so only one of two swapped lines finds its match', () => {
    assert.deepStrictEqual(
      shown(['alpha one', 'beta two'], ['beta two!', 'alpha one!']),
      ['alpha one | ·', 'beta two | beta two!', '· | alpha one!'],
    );
  });

  test('picks the most similar of several candidates', () => {
    assert.deepStrictEqual(
      shown(
        ['const result = compute(a, b);'],
        ['const other = 1;', 'const result = compute(a, c);'],
      ),
      [
        '· | const other = 1;',
        'const result = compute(a, b); | const result = compute(a, c);',
      ],
    );
  });

  test('prefers the pairing that matches more lines over one strong match', () => {
    assert.deepStrictEqual(
      alignLines(['a b c d', 'e f g h'], ['e f g h', 'a b c x', 'e f g x']),
      [
        [u, 0],
        [0, 1],
        [1, 2],
      ],
    );
  });

  test('pairs blank lines with blank lines when nothing better competes, never with text', () => {
    assert.deepStrictEqual(shown(['', 'x()'], ['', 'y()']), [
      ' | ',
      'x() | y()',
    ]);
    assert.deepStrictEqual(shown(['', 'let a = 1;'], ['let a = 2;', '']), [
      ' | ·',
      'let a = 1; | let a = 2;',
      '· | ',
    ]);
  });

  test('matches lines at the threshold, and leaves lines just below it to the order', () => {
    assert.strictEqual(lineSimilarity('a b', 'a c'), similarEnough);
    assert.deepStrictEqual(shown(['a b'], ['x', 'a c']), [
      '· | x',
      'a b | a c',
    ]);
    assert.ok(lineSimilarity('a b c', 'a x y') < similarEnough);
    assert.deepStrictEqual(shown(['a b c'], ['x', 'a x y']), [
      'a b c | x',
      '· | a x y',
    ]);
  });

  test('handles a moved line whose words now sit apart, matching the line sharing the most', () => {
    assert.deepStrictEqual(
      shown(
        ['  <div className="menu" role="menu">'],
        ['  <div', '    className="menu"', '    role="menu"'],
      ),
      [
        '· |   <div',
        '  <div className="menu" role="menu"> |     className="menu"',
        '· |     role="menu"',
      ],
    );
  });

  test('falls back to the plain order for a block too big to compare', () => {
    const removed = Array.from({ length: 300 }, (_, i) => `line ${i}`);
    const added = ['inserted', ...removed];
    const aligned = alignLines(removed, added);
    assert.deepStrictEqual(aligned[0], [0, 0]);
    assert.deepStrictEqual(aligned.at(-1), [u, 300]);
    assert.strictEqual(aligned.length, 301);
  });

  test('falls back to the plain order for a few lines with too many words to compare', () => {
    const long = Array.from({ length: 300_000 }, (_, i) => `w${i % 7}`).join(
      ' ',
    );
    assert.deepStrictEqual(
      alignLines([long, 'alpha one'], ['alpha one', long]),
      [
        [0, 0],
        [1, 1],
      ],
    );
  });

  test('lines up a large block that still fits, even with insertions', () => {
    const removed = Array.from({ length: 150 }, (_, i) => `value ${i} = ${i};`);
    const added = [
      'inserted();',
      ...removed.map((line) => line.replace(';', ' ;')),
    ];
    const aligned = alignLines(removed, added);
    assert.deepStrictEqual(aligned[0], [u, 0]);
    assert.deepStrictEqual(aligned[1], [0, 1]);
    assert.deepStrictEqual(aligned.at(-1), [149, 150]);
  });
});

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function block(next: () => number, length: number): string[] {
  const words = ['a', 'b', 'c', 'd', 'e', 'f', '(', ')', ';', '='];
  return Array.from({ length }, () =>
    Array.from(
      { length: Math.floor(next() * 6) },
      () => words[Math.floor(next() * words.length)],
    ).join(' '),
  );
}

function score(
  removed: readonly string[],
  added: readonly string[],
  aligned: readonly LinePair[],
): number {
  return aligned.reduce((sum, [left, right]) => {
    if (left === u || right === u) {
      return sum;
    }
    const similarity = lineSimilarity(removed[left], added[right]);
    return similarity >= similarEnough ? sum + similarity : sum;
  }, 0);
}

suite('Aligning random changes', () => {
  const next = random(20261001);
  const cases = Array.from({ length: 500 }, () => {
    const removed = block(next, Math.floor(next() * 8));
    const added = block(next, Math.floor(next() * 8));
    return { removed, added, aligned: alignLines(removed, added) };
  });

  test('shows every removed and every added line exactly once, each side in its order', () => {
    for (const { removed, added, aligned } of cases) {
      const left = aligned.flatMap(([index]) => (index === u ? [] : [index]));
      const right = aligned.flatMap(([, index]) =>
        index === u ? [] : [index],
      );
      assert.deepStrictEqual(
        left,
        removed.map((_, index) => index),
      );
      assert.deepStrictEqual(
        right,
        added.map((_, index) => index),
      );
    }
  });

  test('never shows a row with nothing on either side', () => {
    for (const { aligned } of cases) {
      assert.ok(aligned.every(([left, right]) => left !== u || right !== u));
    }
  });

  test('never takes more rows than both sides together, nor fewer than the longer one', () => {
    for (const { removed, added, aligned } of cases) {
      assert.ok(aligned.length <= removed.length + added.length);
      assert.ok(aligned.length >= Math.max(removed.length, added.length));
    }
  });

  test('matches at least as well as putting the lines side by side in order', () => {
    for (const { removed, added, aligned } of cases) {
      const ordered = Array.from(
        { length: Math.max(removed.length, added.length) },
        (_, index): LinePair => [
          index < removed.length ? index : u,
          index < added.length ? index : u,
        ],
      );
      assert.ok(
        score(removed, added, aligned) >= score(removed, added, ordered) - 1e-9,
      );
    }
  });

  test('aligns the same lines the same way every time', () => {
    for (const { removed, added, aligned } of cases.slice(0, 50)) {
      assert.deepStrictEqual(alignLines(removed, added), aligned);
    }
  });

  test('aligns a block against itself line for line', () => {
    for (const { removed } of cases) {
      assert.deepStrictEqual(
        alignLines(removed, removed),
        removed.map((_, index): LinePair => [index, index]),
      );
    }
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
