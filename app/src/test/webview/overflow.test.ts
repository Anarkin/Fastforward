import * as assert from 'node:assert';
import {
  areaColumns,
  codePadding,
  hiddenChanges,
  inlineArea,
  lineWidth,
  numberWidth,
  revealChange,
  revealFound,
  revealScroll,
  shownSideways,
  sideArea,
  textColumn,
  visibleColumns,
} from '../../webview/overflow';

suite('Overflow', () => {
  test('counts the columns before an index, a tab reaching the next stop of 4', () => {
    assert.strictEqual(textColumn('abc', 0), 0);
    assert.strictEqual(textColumn('abc', 2), 2);
    assert.strictEqual(textColumn('\tx', 1), 4);
    assert.strictEqual(textColumn('ab\tx', 3), 4);
    assert.strictEqual(textColumn('abcd\tx', 5), 8);
    assert.strictEqual(textColumn('a\t\tx', 3), 8);
  });

  test('widens a line by its line numbers, the padding on either side and its columns rounded up to a pixel', () => {
    assert.strictEqual(
      lineWidth(13, 2, 7.5),
      2 * numberWidth + 2 * codePadding + 98,
    );
    assert.strictEqual(lineWidth(3, 1, 8), numberWidth + 2 * codePadding + 24);
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
      hiddenChanges(text, words, { first: 10, last: 15 }),
      { left: words[1], right: words[3] },
    );
    assert.deepStrictEqual(
      hiddenChanges(text, words, { first: 12, last: 17 }),
      { left: words[1], right: words[4] },
    );
    assert.deepStrictEqual(hiddenChanges(text, words, { first: 0, last: 30 }), {
      left: undefined,
      right: undefined,
    });
    assert.deepStrictEqual(hiddenChanges(text, [], { first: 10, last: 15 }), {
      left: undefined,
      right: undefined,
    });
  });

  test('counts a tab before a change in its columns', () => {
    const words = [{ start: 2, end: 3 }];
    assert.deepStrictEqual(
      hiddenChanges('\t\tx', words, { first: 0, last: 8 }),
      { left: undefined, right: words[0] },
    );
    assert.deepStrictEqual(
      hiddenChanges('\t\tx', words, { first: 0, last: 9 }),
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
    const hidden = hiddenChanges(text, words, {
      first: 200_000,
      last: 210_000,
    });
    assert.ok(performance.now() - started < 1000);
    assert.deepStrictEqual(hidden, { left: words[3333], right: words[3500] });
  });

  test('scrolls a hidden change to the middle, within the room there is', () => {
    assert.strictEqual(revealScroll(500, 520, 200, 1000), 410);
    assert.strictEqual(revealScroll(20, 40, 200, 1000), 0);
    assert.strictEqual(revealScroll(1150, 1160, 200, 1000), 1000);
  });

  test('takes the sideways scroll of side by side sides from the latest state, not from when they were measured', () => {
    const measured = { scrolled: 120, width: 600, room: 900, minimap: 40 };
    assert.deepStrictEqual(shownSideways(measured, true, 0), {
      ...measured,
      scrolled: 0,
    });
    assert.strictEqual(shownSideways(measured, false, 0), measured);
  });

  test('marks a place words were inserted on the other line, though it has no width', () => {
    const text = 'x'.repeat(20);
    const left = { start: 1, end: 1 };
    const right = { start: 15, end: 15 };
    assert.deepStrictEqual(
      hiddenChanges(text, [left, right], { first: 2, last: 10 }),
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
    const inline = inlineArea(view, 2);
    assert.deepStrictEqual(inline, { origin: 118, visible: 560 });
    assert.deepStrictEqual(areaColumns(view, inline, 10), {
      first: 10,
      last: 62.4,
    });
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
        inlineArea(view, 2),
        'a'.repeat(100),
        { start: 80, end: 84 },
        10,
      ),
      118 + 820 - 280,
    );
  });

  test('scrolls a found match into the middle of the text it is in only when some of it is hidden, the minimap counting as hiding it', () => {
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const text = 'a'.repeat(400);
    const reveal = (scrolled: number, start: number, end: number) => {
      const shown = { ...view, scrolled };
      return revealFound(shown, inlineArea(shown, 2), text, { start, end }, 8);
    };
    assert.strictEqual(reveal(0, 300, 304), 118 + 2416 - 280);
    assert.strictEqual(reveal(2000, 0, 4), 0);
    assert.strictEqual(reveal(0, 10, 14), 0);
    assert.strictEqual(reveal(50, 10, 14), 50);
    assert.strictEqual(reveal(0, 55, 59), 118 + 456 - 280);
  });
});
