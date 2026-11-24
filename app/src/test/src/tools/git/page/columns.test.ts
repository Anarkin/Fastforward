import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  dragColumn,
  draggedWidths,
  drawnWidths,
  maxWidth,
  resetWidth,
  templateOf,
  widthsToLoad,
} from '../../../../../tools/git/page/columns';

suite('Columns', () => {
  test('gives a hidden column no width instead of dropping it, so it keeps its place', () => {
    assert.strictEqual(
      templateOf([460, 300], [true, false]),
      '0px minmax(150px, 300px) minmax(240px, 1fr)',
    );
  });

  test('narrows the columns to fit a narrow window, keeping the last one its room, rather than pushing it out of view', () => {
    assert.strictEqual(
      templateOf([460, 300], [false, false]),
      'minmax(275px, 460px) minmax(150px, 300px) minmax(240px, 1fr)',
    );
  });

  test('leaves the last column its room, which a hidden column does not take', () => {
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000, 0), 460);
    assert.strictEqual(maxWidth([460, 300], [true, false], 1, 1000, 0), 760);
    assert.strictEqual(maxWidth([460, 300], [false, false], 1, 500, 0), 150);
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 500, 0), 275);
  });

  test('leaves the last column its room past the padding and gaps between the columns', () => {
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000, 16), 444);
  });

  test('loads saved widths, or the defaults for ones of other columns', () => {
    const defaults = [460, 300];
    assert.deepStrictEqual(widthsToLoad([400, 250], defaults), [400, 250]);
    assert.strictEqual(widthsToLoad([400], defaults), defaults);
  });

  test('drags a column to a whole width between its least and most', () => {
    assert.deepStrictEqual(
      draggedWidths([400, 250], 1, -1000, 500),
      [400, 150],
    );
    assert.deepStrictEqual(
      draggedWidths([400, 250], 0, -1000, 500),
      [275, 250],
    );
    assert.deepStrictEqual(
      draggedWidths([400, 250], 1, 10000, 500),
      [400, 500],
    );
    assert.deepStrictEqual(draggedWidths([400, 250], 0, 10.6, 500), [411, 250]);
  });

  test('drags a column from the widths the window draws them at, narrower than those saved', () => {
    const start = drawnWidths(
      [700, 500],
      [false, false],
      '574.5px 449.5px 240px',
    );
    assert.deepStrictEqual(start, [574, 449]);
    assert.deepStrictEqual(
      draggedWidths(start, 0, 1, maxWidth(start, [false, false], 0, 1280, 16)),
      [575, 449],
    );
    assert.deepStrictEqual(
      draggedWidths(start, 1, 1, maxWidth(start, [false, false], 1, 1280, 16)),
      [574, 450],
    );
  });

  test('keeps the widths saved for columns drawn at them, which scales like 110% or 133% read a hair narrower, so a drag takes no pixel off them', () => {
    assert.deepStrictEqual(
      drawnWidths([400, 275], [false, false], '399.991px 274.991px 1230.01px'),
      [400, 275],
    );
    assert.deepStrictEqual(
      drawnWidths([301, 250], [false, false], '300.994px 250px 1354.02px'),
      [301, 250],
    );
    assert.deepStrictEqual(
      drawnWidths([275, 150], [false, false], '274.991px 149.991px 1480.01px'),
      [275, 150],
    );
  });

  test('drags no column from below its least width, which a column squeezed to it reads a hair under at scales like 133%', () => {
    assert.deepStrictEqual(
      drawnWidths([700, 500], [false, false], '274.992px 149.988px 239.988px'),
      [275, 150],
    );
  });

  test('keeps the width saved for a hidden column, which is drawn with none', () => {
    assert.deepStrictEqual(
      drawnWidths([700, 500], [true, false], '0px 449.5px 815px'),
      [700, 449],
    );
  });

  test('resets only the column asked', () => {
    assert.deepStrictEqual(resetWidth([400, 250], 1, [460, 300]), [400, 300]);
  });
});

suite('Column drags', () => {
  test('keeps the widths saved when a resizer is pressed and let go without moving, though the window squeezes them as drawn, so a click or a double click to reset one leaves the others as they were saved', () => {
    const dom = new JSDOM(
      '<div class="columns" style="grid-template-columns: 387px 262px 240px; padding: 0px; column-gap: 0px"><div class="resizer"></div></div>',
    );
    const handle = dom.window.document.querySelector<HTMLElement>('.resizer');
    assert.ok(handle);
    handle.setPointerCapture = () => {};
    const globals = {
      window: dom.window,
      document: dom.window.document,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const kept: (readonly number[])[] = [];
      dragColumn(
        {
          pointerId: 1,
          clientX: 100,
          currentTarget: handle,
          preventDefault: () => {},
        },
        0,
        [500, 400],
        [false, false],
        (widths) => kept.push(widths),
      );
      dom.window.dispatchEvent(new dom.window.Event('pointerup'));
      assert.deepStrictEqual(kept, [[500, 400]]);
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
