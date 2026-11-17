import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { diffRows, lineKeys } from '../../../../../components/diff/page/rows';
import {
  anchoredScrollTop,
  rowAnchors,
  scrollAnchor,
} from '../../../../../components/diff/page/scrollAnchor';
import { patch, sized } from '../../../tools/git/page/diffViewFixtures';

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
      anchoredScrollTop({ shows: ['b', 'c'], fraction: 0.5 }, rows, shown, 22),
      88,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['a'], fraction: 0 }, rows, shown, 22),
      0,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['x'], fraction: 0 }, rows, shown, 22),
      undefined,
    );
  });

  test('keeps half a row of text of the line that was at the top in view, as a line scrolled nearly past it lost the pixel kept of it to rows measured a pixel taller and left the next one there', () => {
    const rows = sized(22, 22, 22);
    const shown = [['a'], ['b'], ['c']];
    assert.strictEqual(
      anchoredScrollTop(
        { shows: ['b'], fraction: 219.6 / 220 },
        rows,
        shown,
        22,
      ),
      22 + 11,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b'], fraction: 1 }, rows, shown, 22),
      22 + 11,
    );
  });

  test('takes for the line at the top the one the reader sees there, half a pixel down, rather than one ending a fraction of a pixel into the view, as rows start between device pixels at a scale of 125%', () => {
    const rows = [
      { start: 0, size: 17.6 },
      { start: 17.6, size: 17.6 },
      { start: 35.2, size: 17.6 },
    ];
    const shown = [['a'], ['b'], ['c']];
    assert.deepStrictEqual(scrollAnchor(rows, shown, 17.2), {
      shows: ['b'],
      fraction: 0,
    });
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
      anchoredScrollTop(added, sized(22, 22, 22, 22, 44), split, 22),
      88 + 0.25 * 44,
    );
  });
});
