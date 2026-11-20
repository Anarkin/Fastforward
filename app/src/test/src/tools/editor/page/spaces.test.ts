import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dotLook } from '../../../../../lib/page/dotLook';
import {
  clippedRun,
  dotsBand,
  dotsSpan,
  dotFills,
  dotsBox,
  dotsReach,
  fittingRun,
  holds,
  runsOfLine,
  textRows,
  type LineRuns,
} from '../../../../../tools/editor/page/spaces';

suite('The dots the editor draws for spaces', () => {
  test('sizes a dot as the diff does, 0.16 of the font size in whole device pixels and at least one, starting on a whole device pixel in the middle of each advance', () => {
    assert.deepStrictEqual(dotLook(14, 8, 1), {
      advance: 8,
      dot: 2,
      start: 3,
      pixel: 1,
    });
    assert.deepStrictEqual(dotLook(15, 8, 0.5), {
      advance: 8,
      dot: 2.5,
      start: 2.5,
      pixel: 0.5,
    });
    assert.deepStrictEqual(dotLook(4, 3, 1), {
      advance: 3,
      dot: 1,
      start: 1,
      pixel: 1,
    });
  });

  test('covers each run of spaces with one strip a dot tall, from its left edge and halfway down its row, on whole device pixels of the window, all the strips one path filled with stripes a dot wide an advance apart, which leave a square dot in each advance, the stripes starting where the runs do, as a stroke dashed a dot an advance was cut into its 75,000 dashes again wherever a table padded with spaces was dragged to in the editor, two thirds of its frames coming late', () => {
    const look = dotLook(14, 8, 1);
    assert.deepStrictEqual(
      dotFills(
        [
          { left: 110, top: 220, height: 16, length: 2 },
          { left: 150.4, top: 237.6, height: 16, length: 1 },
          { left: 113, top: 254, height: 16, length: 3 },
        ],
        look,
        { left: 100, top: 200 },
      ),
      [
        { phase: 2, path: 'M10 27h16v2h-16zM50 45h8v2h-8z' },
        { phase: 5, path: 'M13 61h24v2h-24z' },
      ],
    );
    assert.deepStrictEqual(dotFills([], look, { left: 0, top: 0 }), []);
  });

  test('stands the box of the dots on the device pixel nearest the start of their layer, however far the layer starts off one, the dots on whole device pixels inside it and its drawing reaching from that corner to past its last dot and no further, so the browser draws the dots alike whether it paints them with the text or apart in a layer of their own over the caret it keeps under the cursor of the editor, which starts that layer where the drawing starts and placed it from a whole CSS pixel, between two device pixels at 150%, blurring the dots until text was selected', () => {
    const look = dotLook(15, 8, 0.5);
    const runs = [
      { left: 10.3, top: 20.1, height: 16, length: 2 },
      { left: 50.2, top: 60, height: 16, length: 1 },
      { left: 30, top: 100.4, height: 16, length: 0 },
    ];
    const box = dotsBox({ left: 0.2, top: 0.1 }, look.pixel);
    assert.deepStrictEqual(box, { left: 0, top: 0 });
    assert.deepStrictEqual(dotFills(runs, look, box), [
      { phase: 2.5, path: 'M10.5 27h16v2.5h-16z' },
      { phase: 2, path: 'M50 67h8v2.5h-8z' },
    ]);
    assert.deepStrictEqual(dotsReach(runs, look, box), {
      width: 58,
      height: 70,
    });
    assert.deepStrictEqual(dotsReach([], look, box), { width: 0, height: 0 });
    assert.deepStrictEqual(
      dotsBox({ left: 8, top: 89.66666412353516 }, 2 / 3),
      { left: 8, top: 90 },
    );
  });

  test('snaps a run lying on half a device pixel to the right, as the browser snaps the box of a run, though the window reports its place a hair short of it', () => {
    assert.deepStrictEqual(
      dotFills(
        [
          {
            left: 127.5999984741211,
            top: 96.20000457763672,
            height: 16,
            length: 1,
          },
        ],
        dotLook(12, 7.2, 0.8),
        { left: 8, top: 95.2 },
      ),
      [{ phase: 4.8, path: 'M120 8h7.2v1.6h-7.2z' }],
    );
  });

  test('draws the dots of the text on screen and a quarter screen more above and below it, at least 200 pixels, and draws them again only once the screen leaves them', () => {
    assert.deepStrictEqual(dotsBand(1000, 1800), { top: 800, bottom: 2000 });
    assert.deepStrictEqual(dotsBand(1000, 1400), { top: 800, bottom: 1600 });
    const band = dotsBand(1000, 1800);
    assert.strictEqual(holds(band, 900, 1700), true);
    assert.strictEqual(holds(band, 1200, 2000), true);
    assert.strictEqual(holds(band, 1200, 2001), false);
    assert.strictEqual(holds(band, 799, 1600), false);
  });

  test('dots the spaces hanging at the end of a wrapped row only in the one column kept for them before the mark of its break, as the viewer and the diff do, not on past the mark to the edge of the editor, and every space of a row that is not wrapped', () => {
    const run = { left: 100, top: 0, height: 20, length: 1000 };
    assert.deepStrictEqual(
      [
        fittingRun(run, 124, 8),
        fittingRun(run, 108, 8),
        fittingRun({ ...run, left: 116 }, 124.2, 8),
        fittingRun({ ...run, left: 124 }, 124, 8),
        fittingRun({ ...run, length: 2 }, 124, 8),
        fittingRun(run, undefined, 8),
      ],
      [
        { ...run, length: 3 },
        { ...run, length: 1 },
        { ...run, left: 116, length: 1 },
        undefined,
        { ...run, length: 2 },
        run,
      ],
    );
  });

  test('measures the spaces of a line once and places them by where the line is drawn from then on, as measuring every text of every line in view again each time the lines in view changed took a third of those frames, and measures a line again once its text is another', () => {
    const kept = new WeakMap<object, LineRuns>();
    const line = {};
    let measured = 0;
    const measure = (left: number, top: number) => () => {
      measured++;
      return [
        { left: left + 16, top, height: 20, length: 2 },
        { left: left + 8, top: top + 20, height: 20, length: 1 },
      ];
    };
    const first = runsOfLine(
      kept,
      line,
      'a  b c',
      { left: 100, top: 300 },
      measure(100, 300),
    );
    const scrolled = runsOfLine(
      kept,
      line,
      'a  b c',
      { left: 90, top: 140.5 },
      measure(0, 0),
    );
    assert.deepStrictEqual(
      [first, scrolled, measured],
      [
        [
          { left: 116, top: 300, height: 20, length: 2 },
          { left: 108, top: 320, height: 20, length: 1 },
        ],
        [
          { left: 106, top: 140.5, height: 20, length: 2 },
          { left: 98, top: 160.5, height: 20, length: 1 },
        ],
        1,
      ],
    );
    runsOfLine(kept, line, 'a  b cd', { left: 90, top: 140.5 }, measure(0, 0));
    runsOfLine(kept, {}, 'a  b c', { left: 90, top: 140.5 }, measure(0, 0));
    assert.strictEqual(measured, 3);
  });

  test('places the spaces of a text of single cells by the rows it is drawn on, measured once, a cell an advance, rather than measuring each run of spaces, as each measure walks every row of a long line', () => {
    const rows = textRows(
      [
        { left: 40, top: 100, height: 16, width: 32 },
        { left: 10, top: 119, height: 16, width: 16 },
      ],
      'ab  cd',
      8,
    );
    assert.deepStrictEqual(rows, [
      { left: 40, top: 100, height: 16, from: 0, to: 4 },
      { left: 10, top: 119, height: 16, from: 4, to: 6 },
    ]);
  });

  test('leaves a text to be measured run by run where its rows do not add up to its characters, or it has a character not one cell wide', () => {
    const rect = { left: 0, top: 0, height: 16, width: 24 };
    assert.strictEqual(textRows([rect], 'abcd', 8), undefined);
    assert.strictEqual(textRows([rect], 'a	b', 8), undefined);
    assert.strictEqual(textRows([rect], 'aé ', 8), undefined);
    assert.strictEqual(textRows([], '', 8), undefined);
  });

  test('dots only the part of a run of spaces within the columns in sight and a view to either side of them, cutting a run that reaches past them and dropping one outside, and draws anew once the text is scrolled sideways past that room, as lines of thousands of columns had every run of theirs measured and drawn wherever the editor scrolled, a third of its work under a scrollbar dragged', () => {
    const span = dotsSpan(1000, 1800);
    assert.deepStrictEqual(span, { from: 600, to: 2200 });
    assert.deepStrictEqual(dotsSpan(0, 300), { from: -200, to: 500 });
    const run = { left: 500, top: 10, height: 16, length: 30 };
    assert.deepStrictEqual(
      [
        clippedRun(run, span, 8),
        clippedRun({ ...run, left: 2100 }, span, 8),
        clippedRun({ ...run, left: 700 }, span, 8),
        clippedRun({ ...run, left: 100 }, span, 8),
        clippedRun({ ...run, left: 2200 }, span, 8),
        clippedRun(run, undefined, 8),
      ],
      [
        { left: 596, top: 10, height: 16, length: 18 },
        { left: 2100, top: 10, height: 16, length: 13 },
        { left: 700, top: 10, height: 16, length: 30 },
        undefined,
        undefined,
        run,
      ],
    );
  });
});
