import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  aimedRange,
  rowsDrawnNow,
  sameRows,
} from '../../../../lib/page/laterRows';

const span = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, index) => first + index);

suite('Rows drawn around a view', () => {
  test('draws at once only the rows in view and those drawn already around them, leaving the rest of the rows around the view for after the frame, as a notch of the wheel drew twenty lines out of sight inside the frame that scrolled, 12 of its 17 ms in a diff of long lines', () => {
    assert.deepStrictEqual(
      rowsDrawnNow(
        span(20, 80),
        { startIndex: 50, endIndex: 70, count: 500 },
        span(30, 90),
      ),
      span(30, 80),
    );
  });

  test('draws every row around the view at once when some row in view is not drawn yet, after a page down, a jump or at first, as the rows in view could be waited for no longer, and drawing the others with them is what a list measuring its rows as it draws them settles by', () => {
    const drawn = span(20, 80);
    assert.deepStrictEqual(
      rowsDrawnNow(
        drawn,
        { startIndex: 65, endIndex: 85, count: 500 },
        span(45, 105),
      ),
      span(45, 105),
    );
    assert.deepStrictEqual(
      rowsDrawnNow(
        drawn,
        { startIndex: 300, endIndex: 320, count: 500 },
        span(280, 340),
      ),
      span(280, 340),
    );
    assert.deepStrictEqual(
      rowsDrawnNow(
        undefined,
        { startIndex: 0, endIndex: 20, count: 500 },
        span(0, 40),
      ),
      span(0, 40),
    );
  });

  test('takes the rows a glide is heading for with the rows in view, up to two batches ahead, and both ends out to whole batches, so the rows of a notch of the wheel are drawn in one go and the rows drawn stay the same while the list glides over them, as a row drawn and one dropped at each row passed had a fifth of the frames of a glide come late', () => {
    const range = { startIndex: 100, endIndex: 142, count: 20_000 };
    assert.deepStrictEqual(
      [
        aimedRange(range, 110, 8),
        aimedRange({ ...range, startIndex: 103, endIndex: 145 }, 110, 8),
        aimedRange(range, 90, 8),
        aimedRange(range, 130, 8),
        aimedRange(range, undefined, 8),
      ].map(({ startIndex, endIndex }) => [startIndex, endIndex]),
      [
        [96, 159],
        [96, 159],
        [88, 143],
        [96, 159],
        [96, 143],
      ],
    );
  });

  test('leaves the rows in view as they are for a glide heading far off, a page or more, where drawing ahead would draw a second page at once, and keeps to the rows there are at either end of the list', () => {
    const range = { startIndex: 100, endIndex: 142, count: 20_000 };
    assert.deepStrictEqual(
      [
        aimedRange(range, 142, 8),
        aimedRange(range, 58, 8),
        aimedRange({ startIndex: 0, endIndex: 42, count: 20_000 }, 0, 8),
        aimedRange({ startIndex: 60, endIndex: 99, count: 100 }, 70, 8),
        aimedRange({ startIndex: 0, endIndex: 0, count: 0 }, 5, 8),
      ].map(({ startIndex, endIndex }) => [startIndex, endIndex]),
      [
        [100, 142],
        [100, 142],
        [0, 47],
        [56, 99],
        [0, 0],
      ],
    );
  });

  test('draws only the rows in view at once after a jump in a list whose rows are all of one known height, leaving every row around them for once the list rests, as a page key held or a scrollbar dragged drew twice the rows it showed at each step, the half out of sight thrown away at the next', () => {
    const drawn = span(20, 80);
    assert.deepStrictEqual(
      [
        rowsDrawnNow(
          drawn,
          { startIndex: 300, endIndex: 320, count: 500 },
          span(280, 340),
          true,
        ),
        rowsDrawnNow(
          undefined,
          { startIndex: 0, endIndex: 20, count: 500 },
          span(0, 40),
          true,
        ),
        rowsDrawnNow(
          drawn,
          { startIndex: 50, endIndex: 70, count: 500 },
          span(30, 90),
          true,
        ),
      ],
      [span(300, 320), span(0, 20), span(30, 80)],
    );
  });

  test('draws nothing of a list without rows, and keeps to the rows there are once the list got shorter than what was drawn', () => {
    assert.deepStrictEqual(
      rowsDrawnNow(span(0, 40), { startIndex: 0, endIndex: 0, count: 0 }, []),
      [],
    );
    assert.deepStrictEqual(
      rowsDrawnNow(
        span(20, 80),
        { startIndex: 28, endIndex: 29, count: 30 },
        span(8, 29),
      ),
      span(20, 29),
    );
  });

  test('tells the same rows from others by where they start and end', () => {
    assert.deepStrictEqual(
      [
        sameRows(span(3, 9), span(3, 9)),
        sameRows(span(3, 9), span(3, 10)),
        sameRows(span(2, 9), span(3, 9)),
        sameRows(undefined, []),
        sameRows(undefined, span(0, 1)),
      ],
      [true, false, false, true, false],
    );
  });
});
