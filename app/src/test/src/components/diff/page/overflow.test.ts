import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  areaColumns,
  hiddenChanges,
  revealChange,
  revealFound,
  revealScroll,
  dottedColumns,
  sidewaysRoom,
  sideArea,
  textColumn,
  visibleColumns,
  widestColumns,
} from '../../../../../components/diff/page/overflow';
import type { TextWidths } from '../../../../../lib/page/textWidths';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { diffRows } from '../../../../../components/diff/page/rows';

const monospace = (char: number): TextWidths => ({
  char,
  of: (cluster) => assert.fail(`measured ${cluster}`),
});

const drawn: ReadonlyMap<string, number> = new Map([
  ['中', 14],
  ['e\u0301', 8],
  ['👨\u200d👩\u200d👧', 16],
]);

const drawnWidths: TextWidths = {
  char: 8,
  of: (cluster) => drawn.get(cluster) ?? assert.fail(`measured ${cluster}`),
};

suite('Overflow', () => {
  test('dots the spaces of an unwrapped line only in the columns in sight and two stretches of 128 columns either side, as a line of thousands of characters took the browser longer to dot whole than to show, and keeps those very columns until the ones in sight come within 64 of their end, so scrolling sideways draws the dots anew some 200 columns apart, each new set taking some 30 ms to draw for the rows in view, rather than twice every 128', () => {
    const view = { scrolled: 720, width: 800, room: 5000, minimap: 40 };
    const first = dottedColumns(view, 8);
    assert.deepStrictEqual(first, [-256, 512]);
    assert.strictEqual(
      dottedColumns({ ...view, scrolled: 724 }, 8, first),
      first,
    );
    assert.strictEqual(
      dottedColumns({ ...view, scrolled: 2776 }, 8, first),
      first,
    );
    const further = dottedColumns({ ...view, scrolled: 2792 }, 8, first);
    assert.deepStrictEqual(further, [0, 768]);
    assert.strictEqual(
      dottedColumns({ ...view, scrolled: 520 }, 8, further),
      further,
    );
    assert.deepStrictEqual(
      dottedColumns({ ...view, scrolled: 400 }, 8, further),
      [-256, 512],
    );
    assert.deepStrictEqual(
      dottedColumns({ ...view, scrolled: 0 }, 8),
      [-256, 384],
    );
    assert.strictEqual(dottedColumns(undefined, 8, first), undefined);
    assert.strictEqual(dottedColumns(view, 0, first), undefined);
  });

  test('counts the columns before an index, a tab reaching the next stop of 4', () => {
    assert.strictEqual(textColumn('abc', 0), 0);
    assert.strictEqual(textColumn('abc', 2), 2);
    assert.strictEqual(textColumn('\tx', 1), 4);
    assert.strictEqual(textColumn('ab\tx', 3), 4);
    assert.strictEqual(textColumn('abcd\tx', 5), 8);
    assert.strictEqual(textColumn('a\t\tx', 3), 8);
  });

  test('shows the columns between the scrolled edge and the room left before the far edge', () => {
    assert.deepStrictEqual(visibleColumns(0, 100, 10), {
      first: 0,
      last: 10,
    });
    assert.deepStrictEqual(visibleColumns(25, 100, 10), {
      first: 2.5,
      last: 12.5,
    });
    assert.strictEqual(visibleColumns(0, 100, 0), undefined);
  });

  test('marks the nearest change hidden on each side, but not one partly shown', () => {
    const text = 'aaaa bbbb cccc dddd eeee';
    const words = [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
      { start: 15, end: 19 },
      { start: 20, end: 24 },
    ];
    assert.deepStrictEqual(
      hiddenChanges(text, words, { first: 10, last: 15 }, monospace(1)),
      { left: words[1], right: words[3] },
    );
    assert.deepStrictEqual(
      hiddenChanges(text, words, { first: 12, last: 17 }, monospace(1)),
      { left: words[1], right: words[4] },
    );
    assert.deepStrictEqual(
      hiddenChanges(text, words, { first: 0, last: 30 }, monospace(1)),
      { left: undefined, right: undefined },
    );
    assert.deepStrictEqual(
      hiddenChanges(text, [], { first: 10, last: 15 }, monospace(1)),
      { left: undefined, right: undefined },
    );
  });

  test('counts a tab before a change in its columns', () => {
    const words = [{ start: 2, end: 3 }];
    assert.deepStrictEqual(
      hiddenChanges('\t\tx', words, { first: 0, last: 8 }, monospace(1)),
      { left: undefined, right: words[0] },
    );
    assert.deepStrictEqual(
      hiddenChanges('\t\tx', words, { first: 0, last: 9 }, monospace(1)),
      { left: undefined, right: undefined },
    );
  });

  test('finds the hidden changes of a long line in one pass over it, however many tabs and changes it has', () => {
    const text = '\tx'.repeat(100_000);
    const words = Array.from({ length: 6000 }, (_, index) => ({
      start: 1 + index * 30,
      end: 5 + index * 30,
    }));
    const started = performance.now();
    const hidden = hiddenChanges(
      text,
      words,
      { first: 200_000, last: 210_000 },
      monospace(1),
    );
    assert.ok(performance.now() - started < 1000);
    assert.deepStrictEqual(hidden, { left: words[3333], right: words[3500] });
  });

  test('counts a cluster other than printable ASCII as the columns it is drawn across, such as a CJK character, a letter with its accent or an emoji, a place within one counting as its start', () => {
    assert.strictEqual(textColumn('中中x', 2, drawnWidths), 3.5);
    assert.strictEqual(textColumn('中中x', 3, drawnWidths), 4.5);
    const text = 'e\u0301 👨\u200d👩\u200d👧 x';
    assert.strictEqual(textColumn(text, text.length - 1, drawnWidths), 5);
    assert.strictEqual(textColumn(text, 5, drawnWidths), 2);
  });

  test('takes a tab after text drawn across part of a column to the stop after next when the next is less than half a column away, as Chromium does', () => {
    assert.strictEqual(textColumn('中中\tx', 3, drawnWidths), 4);
    assert.strictEqual(textColumn('中中中\tx', 4, drawnWidths), 8);
    assert.strictEqual(textColumn(`${'中'.repeat(9)}\tx`, 10, drawnWidths), 20);
  });

  test('marks a change hidden past the edge after text drawn wider than its characters count, scrolling to where it is drawn', () => {
    const text = `${'中'.repeat(120)} word`;
    const word = { start: 121, end: 125 };
    assert.deepStrictEqual(
      hiddenChanges(text, [word], { first: 0, last: 150 }, drawnWidths),
      { left: undefined, right: word },
    );
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const area = sideArea(view, true);
    assert.strictEqual(
      revealChange(view, area, text, word, drawnWidths),
      6 + 211 * 8 + 16 - 280,
    );
    assert.strictEqual(
      revealFound(view, area, text, word, drawnWidths),
      6 + 211 * 8 + 16 - 280,
    );
  });

  test('finds the hidden changes of a long line of wide characters in one pass over it', () => {
    const text = '\t中'.repeat(100_000);
    const words = Array.from({ length: 6000 }, (_, index) => ({
      start: 1 + index * 30,
      end: 5 + index * 30,
    }));
    const started = performance.now();
    const hidden = hiddenChanges(
      text,
      words,
      { first: 200_000, last: 210_000 },
      drawnWidths,
    );
    assert.ok(performance.now() - started < 1000);
    assert.deepStrictEqual(hidden, { left: words[3333], right: words[3500] });
  });

  test('scrolls a hidden change to the middle, within the room there is', () => {
    assert.strictEqual(revealScroll(500, 520, 200, 1000), 410);
    assert.strictEqual(revealScroll(20, 40, 200, 1000), 0);
    assert.strictEqual(revealScroll(1150, 1160, 200, 1000), 1000);
  });

  test('leaves as much room to scroll sideways as the widest line of the whole diff reaches past the text shown, with its padding on either side and the minimap, whatever rows are drawn, so scrolling down to shorter lines moves nothing sideways, and none while every line fits', () => {
    assert.deepStrictEqual(
      [
        sidewaysRoom(200, 7.5, 600, 40),
        sidewaysRoom(13, 7.5, 600, 40),
        sidewaysRoom(100, 7.2, 600, 40),
      ],
      [2 * 6 + 1500 + 40 - 600, 0, 2 * 6 + 720 + 40 - 600],
    );
  });

  test('marks a place words were inserted on the other line, though it has no width', () => {
    const text = 'x'.repeat(20);
    const left = { start: 1, end: 1 };
    const right = { start: 15, end: 15 };
    assert.deepStrictEqual(
      hiddenChanges(text, [left, right], { first: 2, last: 10 }, monospace(1)),
      { left, right },
    );
  });

  test('hides nothing past an edge there is no more to scroll to', () => {
    const start = { scrolled: 0, width: 600, room: 900, minimap: 40 };
    assert.strictEqual(
      areaColumns(start, sideArea(start, false), 10)?.first,
      -Infinity,
    );
    const end = { ...start, scrolled: 900 };
    assert.strictEqual(
      areaColumns(end, sideArea(end, false), 10)?.last,
      Infinity,
    );
  });

  test('leaves out the line numbers, the padding, the minimap and room for a marker on each edge', () => {
    const view = { scrolled: 200, width: 600, room: 900, minimap: 40 };
    assert.deepStrictEqual(sideArea(view, false), { origin: 6, visible: 600 });
    assert.deepStrictEqual(sideArea(view, true), { origin: 6, visible: 560 });
    assert.deepStrictEqual(areaColumns(view, sideArea(view, false), 10), {
      first: 21.2,
      last: 77.6,
    });
  });

  test('scrolls a hidden change into the middle of the text it is in', () => {
    const view = { scrolled: 0, width: 600, room: 900, minimap: 40 };
    assert.strictEqual(
      revealChange(
        view,
        sideArea(view, true),
        'a'.repeat(100),
        { start: 80, end: 84 },
        monospace(10),
      ),
      6 + 820 - 280,
    );
  });

  test('scrolls a found match into the middle of the text it is in only when some of it is hidden, the minimap counting as hiding it', () => {
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const text = 'a'.repeat(400);
    const reveal = (scrolled: number, start: number, end: number) => {
      const shown = { ...view, scrolled };
      return revealFound(
        shown,
        sideArea(shown, true),
        text,
        { start, end },
        monospace(8),
      );
    };
    assert.strictEqual(reveal(0, 300, 304), 6 + 2416 - 280);
    assert.strictEqual(reveal(2000, 0, 4), 0);
    assert.strictEqual(reveal(0, 10, 14), 0);
    assert.strictEqual(reveal(50, 10, 14), 50);
    assert.strictEqual(reveal(0, 69, 73), 6 + 568 - 280);
  });
});

suite('Diff row heights', () => {
  test('measures how far the widest line of a diff reaches, a tab to its next stop, on either side of one side by side, as that is how far it scrolls sideways', () => {
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
      widestColumns(diffRows(files, new Map(), undefined, undefined, true)),
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
