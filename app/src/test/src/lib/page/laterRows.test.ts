import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsDrawnNow, sameRows } from '../../../../lib/page/laterRows';

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
