import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dotLook } from '../../../../../lib/page/dotLook';
import {
  dotsBand,
  dotsPath,
  dotsStroke,
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

  test('draws a square dot in each advance of a run of spaces, from its left edge and halfway down it, on whole device pixels of the window, as one path drawn where the layer starts rather than a mark around each run, as each mark was an element laid out and painted again and made paging through a long wrapped line twice as slow, and each run as one stroke dashed a dot an advance rather than a square a space, as the path of a table of 75,000 spaces in sight was two megabytes built and parsed again as the editor scrolled, stalling it for 40 ms', () => {
    const look = dotLook(14, 8, 1);
    assert.strictEqual(
      dotsPath(
        [
          { left: 110, top: 220, height: 16, length: 2 },
          { left: 150.4, top: 237.6, height: 16, length: 1 },
        ],
        look,
        { left: 100, top: 200 },
      ),
      'M13 28h10M53 46h2',
    );
    assert.strictEqual(dotsPath([], look, { left: 0, top: 0 }), '');
    assert.deepStrictEqual(dotsStroke(look), { width: 2, dashes: '2 6' });
    assert.deepStrictEqual(dotsStroke(dotLook(4, 1, 1)), {
      width: 1,
      dashes: '1 0',
    });
  });

  test('keeps the dots on whole device pixels however far the layer starts off them', () => {
    const look = dotLook(15, 8, 0.5);
    assert.strictEqual(
      dotsPath([{ left: 10.3, top: 20.1, height: 16, length: 1 }], look, {
        left: 0.2,
        top: 0.1,
      }),
      'M12.8 28.15h2.5',
    );
  });

  test('snaps a run lying on half a device pixel to the right, as the browser snaps the box of a run, though the window reports its place a hair short of it', () => {
    assert.strictEqual(
      dotsPath(
        [
          {
            left: 127.5999984741211,
            top: 96.20000457763672,
            height: 16,
            length: 1,
          },
        ],
        dotLook(12, 7.2, 0.8),
        { left: 8, top: 95.4000015258789 },
      ),
      'M122.4 8.6h1.6',
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
});
