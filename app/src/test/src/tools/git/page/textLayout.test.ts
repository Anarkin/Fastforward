import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import type { TextWidths } from '../../../../../lib/page/textWidths';
import { diffRows } from '../../../../../tools/git/page/diffRows';
import {
  codeSnapOf,
  gapWidth,
  widestColumns,
  wordPadding,
} from '../../../../../tools/git/page/textLayout';

suite('Code grid', () => {
  test('moves the start of code onto the nearest whole device pixel, keeping a side it cannot find where it was', () => {
    const last = { inline: 0.2, left: 0.1, right: -0.3 };
    const snap = codeSnapOf(
      { inline: 683.7, left: undefined, right: 1000.3 },
      1.25,
      last,
    );
    assert.ok(Math.abs((683.7 + snap.inline) * 1.25 - 855) < 1e-9);
    assert.strictEqual(snap.left, 0.1);
    assert.ok(Math.abs((1000.3 + snap.right) * 1.25 - 1250) < 1e-9);
  });
});

function layoutSteps(padding: number, scale: number): number[] {
  const exact = padding * scale * 64;
  return [Math.floor(exact), Math.round(exact)];
}

suite('Drawing code', () => {
  test('pads changed words up to the top and down to the bottom of their line, apart as the text sits off center at scales like 125%, and not before the text is measured', () => {
    const line = { top: 154, bottom: 176 };
    const even = wordPadding(line, { top: 157, bottom: 173 }, 1);
    assert.deepStrictEqual(layoutSteps(even.top, 1), [192, 192]);
    assert.deepStrictEqual(layoutSteps(even.bottom, 1), [192, 192]);
    const off = wordPadding(
      line,
      { top: 154 + 2.4000091552734375, bottom: 176 - 3.5999908447265625 },
      1.25,
    );
    assert.deepStrictEqual(layoutSteps(off.top, 1.25), [192, 192]);
    assert.deepStrictEqual(layoutSteps(off.bottom, 1.25), [288, 288]);
    assert.deepStrictEqual(wordPadding(line, { top: 0, bottom: 0 }, 1), {
      top: 0,
      bottom: 0,
    });
    const over = wordPadding(line, { top: 150, bottom: 180 }, 1);
    assert.deepStrictEqual(
      [layoutSteps(over.top, 1), layoutSteps(over.bottom, 1)],
      [
        [0, 0],
        [0, 0],
      ],
    );
  });

  test('makes the bar where words were inserted 2 pixels wide, a whole number of screen pixels at any scale so it stays sharp', () => {
    for (const [scale, pixels] of [
      [1, 2],
      [1.25, 3],
      [1.5, 3],
      [1.75, 4],
      [2, 4],
    ]) {
      assert.deepStrictEqual(layoutSteps(gapWidth(scale), scale), [
        pixels * 64,
        pixels * 64,
      ]);
    }
  });
});

suite('Diff row heights', () => {
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

  test('measures the widest line of an inline diff by how wide its characters are drawn, as a line of wide characters reached past its count of them and the view jumped once it left the drawn rows', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1 +1 @@',
        '-abcd',
        '+中中中',
      ].join('\n'),
    );
    const wide: TextWidths = {
      char: 8,
      of: (cluster) => (cluster === '中' ? 16 : 8),
    };
    assert.strictEqual(
      widestColumns(diffRows(files, new Map(), undefined), wide),
      6,
    );
  });
});
