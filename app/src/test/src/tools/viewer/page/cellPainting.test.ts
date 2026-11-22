import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CellFrame } from '../../../../../tools/viewer/page/cellFrame';
import {
  cellPainting,
  paintRows,
  type CellPainting,
  type ShownRows,
} from '../../../../../tools/viewer/page/cellPainting';
import type { ScreenRow } from '../../../../../tools/viewer/page/screenRows';
import { paletteOf } from '../../../../../tools/viewer/page/textCells';
import {
  coloredText,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import { packedPart } from '../../../../../components/syntax/page/parts';
import {
  fakePainter,
  look,
  metrics,
  rectsIn,
  shownAt,
  tilesWith,
  widths,
  type FakePainter,
} from './cellFixtures';

const dot = { size: 2, left: 2, top: 7 };

function rowOf(text: string, start: number, more: Partial<ScreenRow> = {}) {
  const row: ScreenRow = {
    start,
    end: start + text.length + 1,
    row: { start, end: start + text.length + 1, text },
    index: 0,
    from: 0,
    to: text.length,
    indent: 0,
    breakAt: undefined,
    hanging: [],
    ...more,
  };
  return row;
}

function shown(
  rows: readonly ScreenRow[],
  more: Partial<ShownRows> = {},
): ShownRows {
  return {
    rows,
    parts: rows.map(() => undefined),
    wrapAt: undefined,
    colored: undefined,
    marksOf: () => [],
    showWhitespace: false,
    widths,
    first: 0,
    ...more,
  };
}

class CountedFrame extends CellFrame {
  placed = 0;

  override tile(...tile: Parameters<CellFrame['tile']>): void {
    this.placed++;
    super.tile(...tile);
  }
}

function painting(now: () => number = () => 0): {
  readonly painter: FakePainter;
  readonly frame: CountedFrame;
  readonly cells: CellPainting;
} {
  const painter = fakePainter();
  const frame = new CountedFrame();
  return {
    painter,
    frame,
    cells: cellPainting(
      tilesWith(painter, 4096, now),
      frame,
      paletteOf(look),
      dot,
    ),
  };
}

const first = rowOf('ab', 0);
const second = rowOf('cd', 3);
const third = rowOf('ef', 6);

suite('Rows painted as cells', () => {
  test('stands each row a row below the one before and says the frame is whole', () => {
    const { painter, cells } = painting();

    const whole = paintRows(cells, shown([first, second]), Infinity);

    assert.strictEqual(whole, true);
    assert.deepStrictEqual(shownAt(cells.frame, painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: 'b', column: 1, y: 0 },
      { shown: 'c', column: 0, y: metrics.rowHeight },
      { shown: 'd', column: 1, y: metrics.rowHeight },
    ]);
  });

  test('draws a row it drew before from the cells it kept, wherever the row stands now and whichever column the canvas starts at, placing the glyphs only of the rows that are new', () => {
    const { painter, frame, cells } = painting();
    paintRows(cells, shown([first, second]), Infinity);
    const placedBefore = frame.placed;

    paintRows(cells, shown([second, third], { first: 1 }), Infinity);

    assert.deepStrictEqual(shownAt(cells.frame, painter), [
      { shown: 'c', column: -1, y: 0 },
      { shown: 'd', column: 0, y: 0 },
      { shown: 'e', column: -1, y: metrics.rowHeight },
      { shown: 'f', column: 0, y: metrics.rowHeight },
    ]);
    assert.strictEqual(frame.placed - placedBefore, 2);
  });

  test('works a row out anew once its colors come, its marks change or whitespace is shown', () => {
    const { painter, cells } = painting();
    const text = coloredText('ab\ncd\n', 'utf-8', false);
    const colored = withPart(
      text,
      packedPart([[{ start: 0, end: 2, kind: 'keyword' }], [], []], 0, true),
    );
    paintRows(cells, shown([first]), Infinity);

    paintRows(cells, shown([first], { colored }), Infinity);
    paintRows(
      cells,
      shown([first], {
        colored,
        marksOf: () => [{ start: 0, end: 1, current: false }],
      }),
      Infinity,
    );
    paintRows(
      cells,
      shown([rowOf('a b', 0)], { colored: undefined, showWhitespace: true }),
      Infinity,
    );

    assert.deepStrictEqual(
      painter.painted.map(({ shown: glyph, ink }) => [glyph, ink]),
      [
        ['a', 'plain'],
        ['b', 'plain'],
        ['a', 'blue'],
        ['b', 'blue'],
        ['a', 'black'],
      ],
    );
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, width }) => [x, width]),
      [[9, 2]],
    );
  });

  test('says the frame is not whole while a glyph is missing, and keeps no row with one, so the next frame draws the row whole', () => {
    let now = 0;
    const { painter, cells } = painting(() => now);
    const slow = shown([first], {
      marksOf: () => {
        now = 3;
        return [];
      },
    });

    const hurried = paintRows(cells, slow, 2);
    const rested = paintRows(cells, shown([first]), Infinity);

    assert.deepStrictEqual([hurried, rested], [false, true]);
    assert.deepStrictEqual(
      painter.painted.map(({ shown: glyph }) => glyph),
      ['a', 'b'],
    );
  });

  test('marks the blanks hanging past the wrap column and where a line breaks, the blanks only while whitespace is hidden, as it is dotted otherwise', () => {
    const { painter, cells } = painting();
    const broken = rowOf('ab  ', 0, {
      breakAt: 4,
      hanging: [
        { column: 2, tab: false },
        { column: 3, tab: false },
      ],
    });

    paintRows(cells, shown([broken], { wrapAt: 3 }), Infinity);

    assert.deepStrictEqual(
      shownAt(cells.frame, painter).map(({ shown: glyph, column }) => [
        glyph,
        column,
      ]),
      [
        ['a', 0],
        ['b', 1],
        ['↵', 4],
      ],
    );
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x }) => x),
      [14 + 2, 21 + 2],
    );
  });

  test('forgets the rows drawn longest ago once it keeps more than eight screens of them, down to four', () => {
    const { cells } = painting();
    const rows = Array.from({ length: 9 }, (_, at) => rowOf(`r${at}`, at * 4));

    for (const row of rows.slice(0, 8)) {
      paintRows(cells, shown([row]), Infinity);
    }

    assert.strictEqual(cells.kept.size, 8);

    paintRows(cells, shown([rows[8]]), Infinity);

    assert.deepStrictEqual(
      [...cells.kept.keys()],
      ['20:0', '24:0', '28:0', '32:0'],
    );
  });

  test('draws every row anew once the atlas started over, as the tiles it kept are stale', () => {
    const { painter, cells } = painting();
    paintRows(cells, shown([first]), Infinity);

    cells.tiles.reset();
    paintRows(cells, shown([first]), Infinity);

    assert.deepStrictEqual(
      painter.painted.map(({ shown: glyph }) => glyph),
      ['a', 'b', 'a', 'b'],
    );
  });
});
