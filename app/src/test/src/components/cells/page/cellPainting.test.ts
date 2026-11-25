import * as assert from 'node:assert';
import type { ScreenRow } from '../../../../../components/cells/page/lines';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { CellFrame } from '../../../../../components/cells/page/cellFrame';
import {
  cellPainting,
  paintRows,
  type CellPainting,
  type ShownRows,
} from '../../../../../components/cells/page/cellPainting';
import {
  paletteOf,
  type TextLook,
} from '../../../../../components/cells/page/textCells';
import {
  filled,
  over,
  packedOf,
  type Rgba,
} from '../../../../../components/cells/page/cellColors';
import {
  coloredText,
  segmentsFrom,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import { packedPart } from '../../../../../components/syntax/page/parts';
import {
  fakePainter,
  look,
  metrics,
  padX,
  padY,
  rectsIn,
  shownAt,
  tilesIn,
  tilesWith,
  widths,
  type FakePainter,
} from './cellFixtures';

const dot = { size: 2, left: 2, top: 7, hairline: 1, gap: 2 };

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
    segmentsOf: undefined,
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

const tintedLook: TextLook = {
  ...look,
  line: [80, 80, 80, 1],
  tints: new Map([
    ['added', [0, 255, 0, 0.5]],
    ['word', [255, 255, 255, 0.5]],
  ]),
};

function painting(
  now: () => number = () => 0,
  looking: TextLook = look,
): {
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
      paletteOf(looking),
      dot,
    ),
  };
}

const dotOn = (ground: Rgba) => packedOf(over(ground, [255, 255, 255, 0.5]));

function ended(ending?: string) {
  const line = { start: 0, end: 5, text: 'abcd', ending };
  return [
    rowOf('abcd', 0, { row: line, to: 2, breakAt: 2 }),
    rowOf('abcd', 0, { row: line, from: 2, index: 1 }),
  ];
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

  test('signs the line break that ends a line while whitespace is shown, each sign of it in a column of its own after the text, a line feed after a carriage return the text ends in, which is signed where it stands without a column of its own, and nothing while whitespace is hidden', () => {
    const lines = [
      rowOf('ab', 0, { row: { start: 0, end: 3, text: 'ab', ending: '␍␊' } }),
      rowOf('c\r', 4, { row: { start: 4, end: 7, text: 'c\r', ending: '␊' } }),
      rowOf('d', 8, { row: { start: 8, end: 9, text: 'd' } }),
    ];
    const signs = (showWhitespace: boolean) => {
      const { painter, cells } = painting();
      paintRows(cells, shown(lines, { showWhitespace }), Infinity);
      return shownAt(cells.frame, painter)
        .filter(({ shown: glyph }) => '␍␊'.includes(glyph))
        .map(({ shown: glyph, column, y }) => [
          glyph,
          column,
          y / metrics.rowHeight,
        ]);
    };

    assert.deepStrictEqual(signs(true), [
      ['␍', 2, 0],
      ['␊', 3, 0],
      ['␍', 1, 1],
      ['␊', 2, 1],
    ]);
    assert.deepStrictEqual(signs(false), []);
  });

  test('shows by Show whitespace only the space, the tab, the carriage return and the line breaks, every control, format character, separator, space, mark, character that shows nothing and noncharacter of Unicode and a sample of the rest drawn alike whether whitespace is shown or not, as a blank nothing in a usual text looks like and a character that shows nothing are signed always', () => {
    const unusual =
      /[\p{Cc}\p{Cf}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}\p{Noncharacter_Code_Point}]/u;
    const codes = Array.from({ length: 0x110000 }, (_, code) => code).filter(
      (code) =>
        (code < 0xd800 || code > 0xdfff) &&
        code !== 0x0a &&
        (code % 0x40 === 0 || unusual.test(String.fromCodePoint(code))),
    );
    const chunk = 0x100;
    const lines: ScreenRow[] = [];
    for (let from = 0; from < codes.length; from += chunk) {
      const text = String.fromCodePoint(...codes.slice(from, from + chunk));
      const start = lines.length * 0x1000;
      lines.push(
        rowOf(text, start, {
          row: { start, end: start + text.length + 2, text, ending: '␍␊' },
        }),
      );
    }
    const counted = (showWhitespace: boolean) => {
      const { painter, cells } = painting();
      paintRows(cells, shown(lines, { showWhitespace }), Infinity);
      const counts = new Map<string, number>();
      const count = (key: string) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      };
      for (const { shown: glyph, column, y } of shownAt(cells.frame, painter)) {
        count(`${glyph} ${String(column)} ${String(y)}`);
      }
      for (const { x, y, color } of rectsIn(cells.frame)) {
        count(`rect ${String(x)} ${String(y)} ${String(color)}`);
      }
      return counts;
    };
    const hidden = counted(false);
    const signed = counted(true);
    const added = new Map<string, number>();
    for (const [key, times] of signed) {
      const more = times - (hidden.get(key) ?? 0);
      if (more > 0) {
        const kind = key.split(' ')[0] ?? '';
        added.set(kind, (added.get(kind) ?? 0) + more);
      }
    }
    const lost = [...hidden]
      .filter(([key, times]) => times > (signed.get(key) ?? 0))
      .map(([key]) => key.split(' ')[0]);

    assert.deepStrictEqual(lost, ['\r']);
    assert.deepStrictEqual(Object.fromEntries(added), {
      [strings.symbols.tab]: 1,
      [strings.symbols.carriageReturn]: 1 + lines.length,
      [strings.symbols.lineFeed]: lines.length,
      rect: 1,
    });
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

    const segmentsOf = segmentsFrom(colored);
    paintRows(cells, shown([first], { segmentsOf }), Infinity);
    paintRows(
      cells,
      shown([first], {
        segmentsOf,
        marksOf: () => [{ start: 0, end: 1, current: false }],
      }),
      Infinity,
    );
    paintRows(
      cells,
      shown([rowOf('a b', 0)], {
        segmentsOf: undefined,
        showWhitespace: true,
      }),
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

  test('marks the part of each row that is selected, and works a row out anew once what is selected of it changes, the rows the selection does not reach taken from the cells kept', () => {
    const { frame, cells } = painting();
    const rows = [rowOf('abcd', 0), rowOf('efgh', 5), rowOf('ijkl', 10)];
    const selection = {
      anchor: { start: 0, char: 2 },
      focus: { start: 5, char: 1 },
    };

    paintRows(cells, shown(rows, { selection }), Infinity);

    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [
        [14, 0, 14],
        [28, 0, 7],
        [0, 16, 7],
      ],
    );

    const placedBefore = frame.placed;
    paintRows(
      cells,
      shown(rows, {
        selection: { ...selection, focus: { start: 5, char: 3 } },
      }),
      Infinity,
    );

    assert.strictEqual(frame.placed - placedBefore, 4);
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [
        [14, 0, 14],
        [28, 0, 7],
        [0, 16, 21],
      ],
    );
  });

  test('works a row out anew once the tab size it is drawn at changes, as its tabs stop elsewhere, and takes it from the cells kept while it stays', () => {
    const { frame, cells } = painting();
    const rows = [rowOf(`a${String.fromCharCode(9)}b`, 0)];
    const base = shown(rows);
    paintRows(cells, base, Infinity);
    const placedFirst = frame.placed;
    paintRows(cells, base, Infinity);
    const placedAgain = frame.placed;
    paintRows(
      cells,
      shown(rows, { widths: { ...base.widths, tabSize: 8 } }),
      Infinity,
    );
    assert.deepStrictEqual(
      [placedAgain - placedFirst, frame.placed - placedAgain],
      [0, 2],
    );
  });

  test('marks every stretch of a row that one of several selections takes, as a text edited with several cursors has them, and works the row out anew once one of them goes', () => {
    const { frame, cells } = painting();
    const rows = [rowOf('abcdefgh', 0)];
    const selections = [
      { anchor: { start: 0, char: 1 }, focus: { start: 0, char: 2 } },
      { anchor: { start: 0, char: 6 }, focus: { start: 0, char: 4 } },
    ];

    paintRows(cells, shown(rows, { selections }), Infinity);

    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [
        [7, 0, 7],
        [28, 0, 14],
      ],
    );

    const placedBefore = frame.placed;
    paintRows(
      cells,
      shown(rows, { selections: selections.slice(0, 1) }),
      Infinity,
    );

    assert.strictEqual(frame.placed - placedBefore, 8);
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [[7, 0, 7]],
    );
  });

  test('draws a cell of the selection after the end of each line the selection runs on from into the text after it, as the browser marked its line break selected, and none after an empty line, a row its line goes on from or the line the selection ends in, working a row out anew once its line break is selected no longer', () => {
    const { frame, cells } = painting();
    const long = rowOf('abcd', 0);
    const rows = [
      { ...long, to: 2 },
      { ...long, from: 2, index: 1 },
      rowOf('', 5),
      rowOf('ef', 6),
    ];
    const selection = {
      anchor: { start: 0, char: 1 },
      focus: { start: 6, char: 1 },
    };

    paintRows(cells, shown(rows, { selection }), Infinity);

    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [
        [7, 0, 7],
        [0, 16, 14],
        [14, 16, 7],
        [0, 48, 7],
      ],
    );

    const placedBefore = frame.placed;
    paintRows(
      cells,
      shown(rows, {
        selection: { ...selection, focus: { start: 5, char: 0 } },
      }),
      Infinity,
    );

    assert.strictEqual(frame.placed - placedBefore, 4);
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x, y, width }) => [x, y, width]),
      [
        [7, 0, 7],
        [0, 16, 14],
      ],
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
        ['⏎', 4],
      ],
    );
    assert.deepStrictEqual(
      rectsIn(cells.frame).map(({ x }) => x),
      [14 + 2, 21 + 2],
    );
  });

  test('fills a selection and a find through the blanks hanging past the wrap column no further than the column kept for them, where their dot stands, as a run of spaces at the end of a wrapped row ran either on to the edge of the view, and fills an unwrapped row as far as its text goes', () => {
    const { cells } = painting();
    const padded = 'ab      ';
    const broken = rowOf(padded, 0, { breakAt: 4 });
    const selection = {
      anchor: { start: 0, char: 1 },
      focus: { start: 0, char: padded.length },
    };
    const grounds = () =>
      rectsIn(cells.frame)
        .filter(({ height }) => height === metrics.rowHeight)
        .map(({ x, width }) => [x, width]);

    paintRows(cells, shown([broken], { wrapAt: 3, selection }), Infinity);
    assert.deepStrictEqual(grounds(), [[7, 21]]);

    paintRows(
      cells,
      shown([broken], {
        wrapAt: 3,
        marksOf: () => [{ start: 5, end: 8, current: false }],
      }),
      Infinity,
    );
    assert.deepStrictEqual(grounds(), []);

    paintRows(
      cells,
      shown([rowOf(padded, 0)], {
        selection: { ...selection, focus: { start: 0, char: 7 } },
      }),
      Infinity,
    );
    assert.deepStrictEqual(grounds(), [[7, 42]]);
  });

  test('blends the dot of a space with the ground it stands on, the color of a selection where it is selected, as a dot on text selected kept the shade it has on the plain ground, and draws the dot of a space found in the ink of what was found, as its text takes it, rather than washed out over the yellow of the find', () => {
    const seeThrough: TextLook = { ...look, dot: [255, 255, 255, 0.5] };
    const { cells } = painting(() => 0, seeThrough);
    const row = rowOf('a b c d', 0);
    const dots = () =>
      rectsIn(cells.frame)
        .filter(
          ({ width, height }) => width === dot.size && height === dot.size,
        )
        .map(({ color }) => color);

    paintRows(
      cells,
      shown([row], {
        showWhitespace: true,
        selection: {
          anchor: { start: 0, char: 2 },
          focus: { start: 0, char: 4 },
        },
        marksOf: () => [{ start: 4, end: 6, current: false }],
      }),
      Infinity,
    );

    assert.deepStrictEqual(dots(), [
      packedOf(look.dots),
      dotOn(filled(look.ground, look.selected)),
      packedOf([0, 0, 0, 1]),
    ]);
  });

  test('signs the end of a line that ends in a carriage return after its last character while whitespace is shown, on the last row of the line alone, and works the row out anew once its ending changes, as a text edited keeps the ending of each line apart from its text', () => {
    const { painter, cells } = painting();
    const signs = () =>
      shownAt(cells.frame, painter)
        .filter(({ shown: glyph }) => glyph === '␍')
        .map(({ column, y }) => [column, y / metrics.rowHeight]);

    paintRows(cells, shown(ended('␍'), { showWhitespace: true }), Infinity);
    assert.deepStrictEqual(signs(), [[2, 1]]);

    paintRows(cells, shown(ended(), { showWhitespace: true }), Infinity);
    assert.deepStrictEqual(signs(), []);

    paintRows(cells, shown(ended('␍')), Infinity);
    assert.deepStrictEqual(signs(), []);
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

  test('stands each row where it is told once told, rather than a row below the one before, as the rows of a diff stand between the headers of its files and beside lines wrapped onto more rows than they are', () => {
    const { painter, cells } = painting();

    paintRows(cells, shown([first, second], { tops: [5, 40] }), Infinity);

    assert.deepStrictEqual(shownAt(cells.frame, painter), [
      { shown: 'a', column: 0, y: 5 },
      { shown: 'b', column: 1, y: 5 },
      { shown: 'c', column: 0, y: 40 },
      { shown: 'd', column: 1, y: 40 },
    ]);
  });

  test('tints a band from edge to edge under its rows, numbers it at its top in each column of numbers and rules a line down the canvas, in a frame of their own under the text, which is cut where it starts, so a text scrolled sideways never covers its numbers', () => {
    const { painter, cells } = painting(undefined, tintedLook);

    paintRows(
      cells,
      shown([first], {
        left: 60,
        bands: [
          { top: 0, height: 32, tint: 'added', numbers: [undefined, '7'] },
          { top: 32, height: 16, numbers: ['3', '4'] },
        ],
        gutter: { rights: [20, 50], line: 56 },
      }),
      Infinity,
    );

    assert.deepStrictEqual(rectsIn(cells.under), [
      { x: 0, y: 0, width: 0x7fff, height: 32, color: 0xff088808 },
      { x: 56, y: 0, width: 1, height: 0x7fff, color: 0xff505050 },
    ]);
    assert.deepStrictEqual(
      tilesIn(cells.under).map(({ x, y, u }) => [
        painter.painted.find((each) => each.x === u)?.shown,
        x + padX,
        y + padY,
      ]),
      [
        ['7', 43, 0],
        ['3', 13, 32],
        ['4', 43, 32],
      ],
    );
    assert.deepStrictEqual(
      tilesIn(cells.frame).map(({ x }) => x + padX),
      [60, 67],
    );
  });

  test('draws the changed words of a line on their tint over that of its row and bars the places the other line has words it lacks, at the end of the line too, working the row out anew once its tints change', () => {
    const { painter, cells } = painting(undefined, tintedLook);
    const line = rowOf('abcd', 0);
    const tints = {
      row: 'added',
      word: 'word',
      words: [{ from: 1, to: 3 }],
      gaps: [3, 4],
    };

    paintRows(cells, shown([line], { tintsOf: () => tints }), Infinity);
    const grounds = painter.painted.map(({ shown: glyph, ground }) => [
      glyph,
      ground,
    ]);
    const rects = rectsIn(cells.frame);
    const plain = { row: 'added' };
    paintRows(cells, shown([line], { tintsOf: () => plain }), Infinity);

    assert.deepStrictEqual(grounds, [
      ['a', 'rgb(8 136 8)'],
      ['b', 'rgb(132 196 132)'],
      ['c', 'rgb(132 196 132)'],
      ['d', 'rgb(8 136 8)'],
    ]);
    assert.deepStrictEqual(rects, [
      { x: 7, y: 0, width: 14, height: 16, color: 0xff84c484 },
      { x: 20, y: 0, width: 2, height: 16, color: 0xff84c484 },
      { x: 27, y: 0, width: 2, height: 16, color: 0xff84c484 },
    ]);
    assert.deepStrictEqual(rectsIn(cells.frame), []);
  });
});
