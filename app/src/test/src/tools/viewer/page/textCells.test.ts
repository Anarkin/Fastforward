import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CellFrame } from '../../../../../tools/viewer/page/cellFrame';
import {
  drawPieces,
  paletteOf,
  type DrawnPiece,
  type TextDrawing,
} from '../../../../../tools/viewer/page/textCells';
import {
  fakePainter,
  look,
  metrics,
  padX,
  padY,
  rectsIn,
  shownAt,
  tileHeight,
  tilesIn,
  tilesWith,
  widths,
  type FakePainter,
} from './cellFixtures';

const dot = { size: 2, left: 2, top: 7 };

const dotsGray = 0xff6d6d6d;

const yellow = 0xff00ccff;

function drawn(
  pieces: readonly DrawnPiece[],
  {
    blanks = false,
    first = 0,
    limit = Infinity,
    from = 0,
    y = 0,
    now = (): number => 0,
    budget = Infinity,
  } = {},
): {
  readonly frame: CellFrame;
  readonly painter: FakePainter;
  readonly end: number;
} {
  const painter = fakePainter();
  const tiles = tilesWith(painter, 4096, now);
  tiles.within(budget);
  const drawing: TextDrawing = {
    tiles,
    frame: new CellFrame(),
    palette: paletteOf(look),
    widths,
    blanks,
    first,
    limit,
    dot,
  };
  const end = drawPieces(drawing, pieces, from, y);
  return { frame: drawing.frame, painter, end };
}

suite('Cells of a text', () => {
  test('stands each letter a cell after the one before, its tile reaching half a cell and a quarter of a row around its cell', () => {
    const { frame, painter, end } = drawn([{ text: 'abc' }], { y: 32 });

    assert.deepStrictEqual(shownAt(frame, painter), [
      { shown: 'a', column: 0, y: 32 },
      { shown: 'b', column: 1, y: 32 },
      { shown: 'c', column: 2, y: 32 },
    ]);
    assert.deepStrictEqual(
      tilesIn(frame).map(({ x, y, width, height }) => [x, y, width, height]),
      [
        [-padX, 32 - padY, metrics.advance + 2 * padX, tileHeight],
        [7 - padX, 32 - padY, metrics.advance + 2 * padX, tileHeight],
        [14 - padX, 32 - padY, metrics.advance + 2 * padX, tileHeight],
      ],
    );
    assert.strictEqual(end, 3);
  });

  test('starts where its row starts and counts from the first column the canvas shows', () => {
    const { frame, painter } = drawn([{ text: 'ab' }], { from: 70, first: 64 });

    assert.deepStrictEqual(
      shownAt(frame, painter).map(({ column }) => column),
      [6, 7],
    );
  });

  test('draws nothing for a space, and a dot in its cell while whitespace is shown, up to the column lines wrap at', () => {
    assert.deepStrictEqual(rectsIn(drawn([{ text: 'a b' }]).frame), []);
    assert.deepStrictEqual(
      rectsIn(drawn([{ text: 'a b  ' }], { blanks: true, limit: 3 }).frame),
      [
        { x: 7 + 2, y: 7, width: 2, height: 2, color: dotsGray },
        { x: 21 + 2, y: 7, width: 2, height: 2, color: dotsGray },
      ],
    );
  });

  test('goes on at the next tab stop after a tab, signing it in its first cell only while whitespace is shown', () => {
    const plain = drawn([{ text: 'a\tb' }]);
    const signed = drawn([{ text: 'a\tb' }], { blanks: true });

    assert.deepStrictEqual(shownAt(plain.frame, plain.painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: 'b', column: 4, y: 0 },
    ]);
    assert.deepStrictEqual(shownAt(signed.frame, signed.painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: '→', column: 1, y: 0 },
      { shown: 'b', column: 4, y: 0 },
    ]);
    assert.strictEqual(
      signed.painter.painted.find(({ shown }) => shown === '→')?.ink,
      'muted',
    );
  });

  test('gives a wide character two cells, drawn in the middle of them, and a run of them no pass of the segmenter', () => {
    const { frame, painter, end } = drawn([{ text: 'a中文b' }]);

    assert.deepStrictEqual(shownAt(frame, painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: '中', column: 1, y: 0 },
      { shown: '文', column: 3, y: 0 },
      { shown: 'b', column: 5, y: 0 },
    ]);
    assert.deepStrictEqual(
      painter.painted.find(({ shown }) => shown === '中')?.shape,
      { cells: 2, centered: true, scale: 1 },
    );
    assert.strictEqual(end, 6);
  });

  test('keeps a letter and the mark joined to it in one cell', () => {
    const { frame, painter, end } = drawn([{ text: 'éx' }]);

    assert.deepStrictEqual(shownAt(frame, painter), [
      { shown: 'é', column: 0, y: 0 },
      { shown: 'x', column: 1, y: 0 },
    ]);
    assert.strictEqual(end, 2);
  });

  test('draws a control character by its picture, the vertical tab and the form feed too, which a canvas would draw as spaces', () => {
    const { painter } = drawn([{ text: '\u0001\u000b\u000c\u007f' }]);

    assert.deepStrictEqual(
      painter.painted.map(({ shown }) => shown),
      ['␁', '␋', '␌', '␡'],
    );
  });

  test('signs a carriage return and a no-break space while whitespace is shown, the first taking no cell', () => {
    const { frame, painter, end } = drawn([{ text: 'a b\r' }], {
      blanks: true,
    });

    assert.deepStrictEqual(shownAt(frame, painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: '⍽', column: 1, y: 0 },
      { shown: 'b', column: 2, y: 0 },
      { shown: '␍', column: 3, y: 0 },
    ]);
    assert.strictEqual(end, 3);
  });

  test('draws each piece in the color of its kind, and what has none in the color of plain text', () => {
    const { painter } = drawn([
      { text: 'if', kind: 'keyword' },
      { text: 'x' },
      { text: 'y', kind: 'unheard' },
    ]);

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink }) => [shown, ink]),
      [
        ['i', 'blue'],
        ['f', 'blue'],
        ['x', 'plain'],
        ['y', 'plain'],
      ],
    );
  });

  test('lays the ground of a find under what it found, a row high, and draws its glyphs for that ground, in the ink of the find or, for an occurrence, of its kind', () => {
    const { frame, painter } = drawn(
      [
        { text: 'a' },
        { text: 'bc', kind: 'keyword', mark: 'match' },
        { text: 'd', kind: 'keyword', mark: 'occurrence' },
      ],
      { y: 16 },
    );

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 7, y: 16, width: 14, height: 16, color: yellow },
      { x: 21, y: 16, width: 7, height: 16, color: 0xff0e3641 },
    ]);
    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink, ground }) => [shown, ink, ground]),
      [
        ['a', 'plain', 'rgb(17 17 17)'],
        ['b', 'black', 'rgb(255 204 0)'],
        ['c', 'black', 'rgb(255 204 0)'],
        ['d', 'blue', 'rgb(65 54 14)'],
      ],
    );
    assert.deepStrictEqual(
      tilesIn(frame).map(({ ground }) => ground),
      [0xff111111, yellow, yellow, 0xff0e3641],
    );
  });

  test('lays the ground of the selection under what is selected, a row high, its glyphs drawn for that ground in the ink they had, what a find found among them too', () => {
    const { frame, painter } = drawn([
      { text: 'ab', selected: true },
      { text: 'c', mark: 'match', selected: true },
      { text: 'd' },
    ]);

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 0, y: 0, width: 14, height: 16, color: 0xff784f26 },
      { x: 14, y: 0, width: 7, height: 16, color: 0xff784f26 },
    ]);
    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink, ground }) => [shown, ink, ground]),
      [
        ['a', 'plain', 'rgb(38 79 120)'],
        ['b', 'plain', 'rgb(38 79 120)'],
        ['c', 'black', 'rgb(38 79 120)'],
        ['d', 'plain', 'rgb(17 17 17)'],
      ],
    );
  });

  test('counts a glyph there was no time to draw as missing and leaves its cells empty, the text after it standing where it would', () => {
    let now = 0;
    const { frame, painter, end } = drawn([{ text: 'a中b' }], {
      budget: 2,
      now: () => {
        now += 1.5;
        return now;
      },
    });

    assert.deepStrictEqual(
      painter.painted.map(({ shown }) => shown),
      ['a'],
    );
    assert.deepStrictEqual([frame.missing, end], [2, 4]);
  });
});
