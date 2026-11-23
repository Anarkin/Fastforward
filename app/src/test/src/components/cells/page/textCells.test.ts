import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CellFrame } from '../../../../../components/cells/page/cellFrame';
import {
  drawDigits,
  drawPieces,
  paletteOf,
  type DrawnPiece,
  type TextDrawing,
  type TextLook,
} from '../../../../../components/cells/page/textCells';
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
import { strings } from '../../../../../lib/shared/strings';
import { blankSignOf } from '../../../../../lib/page/blankSigns';
import { invisibleParts } from '../../../../../lib/page/invisibles';

const dot = { size: 2, left: 2, top: 7, hairline: 1, gap: 2 };

const dotsGray = 0xff6d6d6d;

const yellow = 0xff00ccff;

const matchInk = 0xff000000;

const tintedLook: TextLook = {
  ...look,
  tints: new Map([
    ['added', [0, 255, 0, 0.5]],
    ['word', [255, 255, 255, 0.5]],
  ]),
  occurrence: { ink: undefined, ground: [255, 0, 0, 0.5] },
};

function drawn(
  pieces: readonly DrawnPiece[],
  {
    blanks = false,
    first = 0,
    left = 0,
    limit = Infinity,
    from = 0,
    y = 0,
    now = (): number => 0,
    budget = Infinity,
    tint = undefined as string | undefined,
    tinted = look,
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
    palette: paletteOf(tinted),
    widths,
    blanks,
    first,
    left,
    limit,
    dot,
  };
  const end = drawPieces(drawing, pieces, from, y, tint);
  return { frame: drawing.frame, painter, end };
}

function drawnAsItself(character: string): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\r' ||
    character === '\n'
  );
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

  test('draws a control character as the sign of the invisible, a cell each, the vertical tab, the form feed and the delete too, as two letters of its name told no one what it was', () => {
    const { frame, painter, end } = drawn([
      { text: '\u0001\u000b\u000c\u007f' },
    ]);

    assert.deepStrictEqual(
      shownAt(frame, painter).map(({ shown, column }) => [shown, column]),
      [0, 1, 2, 3].map((column) => [strings.symbols.invisible, column]),
    );
    assert.strictEqual(end, 4);
  });

  test('draws the sign of a control character in the muted color of the signs of whitespace, whatever the kind of the piece holding it and whether whitespace is shown, as it marks a character rather than being text, and in the ink of a find match under it', () => {
    for (const blanks of [false, true]) {
      const { painter } = drawn(
        [
          { text: '"a\u001bb', kind: 'string' },
          { text: '\u0000', kind: 'keyword', mark: 'match' },
        ],
        { blanks },
      );

      assert.deepStrictEqual(
        painter.painted.map(({ shown, ink }) => [shown, ink]),
        [
          ['"', 'orange'],
          ['a', 'orange'],
          [strings.symbols.invisible, 'muted'],
          ['b', 'orange'],
          [strings.symbols.invisible, 'black'],
        ],
      );
    }
  });

  test('draws a sign of whitespace or of a control byte found in the ink of what was found, on its ground, and one selected in the muted ink on the ground of the selection, as each was drawn muted on the plain ground whatever lay under it', () => {
    const { painter } = drawn(
      [
        { text: '\t', mark: 'match' },
        { text: '␊', blank: true, mark: 'match' },
        { text: '␊', blank: true, selected: true },
        { text: '␊', blank: true },
      ],
      { blanks: true },
    );

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink, ground }) => [shown, ink, ground]),
      [
        ['→', 'black', 'rgb(255 204 0)'],
        ['␊', 'black', 'rgb(255 204 0)'],
        ['␊', 'muted', 'rgb(38 79 120)'],
        ['␊', 'muted', 'rgb(17 17 17)'],
      ],
    );
  });

  test('signs a carriage return while whitespace is shown, taking no cell, and a no-break space as the invisible, as every blank but the space is', () => {
    const { frame, painter, end } = drawn([{ text: 'a b\r' }], {
      blanks: true,
    });

    assert.deepStrictEqual(shownAt(frame, painter), [
      { shown: 'a', column: 0, y: 0 },
      { shown: strings.symbols.invisible, column: 1, y: 0 },
      { shown: 'b', column: 2, y: 0 },
      { shown: '␍', column: 3, y: 0 },
    ]);
    assert.strictEqual(end, 3);
  });

  test('keeps what a sign of whitespace and the sign of a control character draw within the device pixels of their cell, which a block cursor and a selection cover, cutting off the edges that fall beyond, as the picture of a line end peeked out beside a block cursor on it, while a letter keeps its edges', () => {
    const { frame, painter } = drawn([{ text: 'a\u001b\t' }], {
      blanks: true,
    });
    const tiles = tilesIn(frame);

    assert.deepStrictEqual(
      shownAt(frame, painter).map(({ shown, column }) => [shown, column]),
      [
        ['a', 0],
        [strings.symbols.invisible, 1],
        ['→', 2],
      ],
    );
    assert.deepStrictEqual(
      tiles.map(({ x, width }) => [x, width]),
      [
        [-padX, metrics.advance + 2 * padX],
        [metrics.advance, metrics.advance],
        [2 * metrics.advance, metrics.advance],
      ],
    );
    assert.deepStrictEqual(
      tiles.map(({ u }, at) => u - (painter.painted[at]?.x ?? 0)),
      [0, padX, padX],
    );
  });

  test('draws every invisible character as a sign on a cell of its own, whether whitespace is shown or not, a direction control too, and one an ordinary letter joins after that letter, leaving an emoji whole', () => {
    for (const blanks of [false, true]) {
      const { frame, painter, end } = drawn(
        [{ text: 'a\u200Bb\u202Ec\u200D' }],
        { blanks },
      );

      assert.deepStrictEqual(
        shownAt(frame, painter).map(({ shown, column }) => [shown, column]),
        [
          ['a', 0],
          [strings.symbols.invisible, 1],
          ['b', 2],
          [strings.symbols.invisible, 3],
          ['c', 4],
          [strings.symbols.invisible, 5],
        ],
        String(blanks),
      );
      assert.strictEqual(end, 6);
    }
  });

  test('signs the no-break spaces, every other space and the braille blank as the invisible whether whitespace is shown or not, as nothing in a usual text looks like them, and the object replacement character as the sign of the invisible, while the space, the tab and the carriage return are signed only while whitespace is shown', () => {
    for (const blanks of [false, true]) {
      const { frame, painter } = drawn(
        [{ text: 'a\u00A0b\u2003c\u2800d\uFFFCe\tf' }],
        { blanks },
      );

      assert.deepStrictEqual(
        shownAt(frame, painter).map(({ shown, column }) => [shown, column]),
        [
          ['a', 0],
          [strings.symbols.invisible, 1],
          ['b', 2],
          [strings.symbols.invisible, 3],
          ['c', 4],
          [strings.symbols.invisible, 5],
          ['d', 6],
          [strings.symbols.invisible, 7],
          ['e', 8],
          ...(blanks ? [[strings.symbols.tab, 9]] : []),
          ['f', 12],
        ],
        String(blanks),
      );
    }
  });

  test('never draws a sign in place of a character that has a shape of its own, a letter, a mark, a digit, punctuation, a symbol, a character of private use or one Unicode has not assigned, every character of Unicode drawn as itself unless it shows nothing or blank, with whitespace shown or not', () => {
    const showsNothing =
      /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\p{Default_Ignorable_Code_Point}\p{Noncharacter_Code_Point}\uFFFC\u2800]$/u;
    const signs = new Set([strings.symbols.invisible]);
    const chunk = 0x400;
    for (let first = 0; first < 0x110000; first += chunk) {
      const characters = Array.from({ length: chunk }, (_, at) => first + at)
        .filter((code) => (code < 0xd800 || code > 0xdfff) && code !== 0x0a)
        .map((code) => String.fromCodePoint(code));
      const signed = characters.filter(
        (character) =>
          blankSignOf(character, true) !== undefined ||
          invisibleParts(character)?.some(({ hidden }) => hidden) === true,
      );
      assert.deepStrictEqual(
        signed.filter((character) => !showsNothing.test(character)),
        [],
      );
      const expected = characters.filter(
        (character) =>
          signs.has(character) ||
          (showsNothing.test(character) && !drawnAsItself(character)),
      ).length;
      for (const blanks of [false, true]) {
        const { frame, painter } = drawn([{ text: characters.join('') }], {
          blanks,
        });
        assert.strictEqual(
          shownAt(frame, painter).filter(({ shown }) => signs.has(shown))
            .length,
          expected,
          `U+${first.toString(16)} ${String(blanks)}`,
        );
      }
    }
  });

  test('draws an invisible character that joins the character after it, as the Arabic number sign, before that character, in the order of the text', () => {
    const { frame, painter, end } = drawn([{ text: 'a\u0600|b' }]);

    assert.deepStrictEqual(
      shownAt(frame, painter).map(({ shown, column }) => [shown, column]),
      [
        ['a', 0],
        [strings.symbols.invisible, 1],
        ['|', 2],
        ['b', 3],
      ],
    );
    assert.strictEqual(end, 4);
  });

  test('keeps the color of text selected whatever mark is under it, a copy of the text selected or a match of a find, as the selected copy took the ink of a find match, near black on the blue of the selection of the dark theme', () => {
    const { painter } = drawn([
      { text: 'if', kind: 'keyword', mark: 'occurrence', selected: true },
      { text: 'x', mark: 'match', selected: true },
      { text: 'y', mark: 'match' },
    ]);

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink }) => [shown, ink]),
      [
        ['i', 'blue'],
        ['f', 'blue'],
        ['x', 'plain'],
        ['y', 'black'],
      ],
    );
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

  test('lays the ground of the selection under what is selected, a row high, its glyphs drawn for that ground in the ink of their text, what a find found among them too', () => {
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
        ['c', 'plain', 'rgb(38 79 120)'],
        ['d', 'plain', 'rgb(17 17 17)'],
      ],
    );
  });

  test('dots the spaces of what is selected or found over its ground, which is laid before them, as a ground laid after its text would cover them', () => {
    const { frame } = drawn([{ text: 'a b', selected: true }, { text: ' ' }], {
      blanks: true,
    });

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 0, y: 0, width: 21, height: 16, color: 0xff784f26 },
      { x: 9, y: 7, width: 2, height: 2, color: dotsGray },
      { x: 23, y: 7, width: 2, height: 2, color: dotsGray },
    ]);
  });

  test('dots a space found in the ink of what was found, as the text found takes it, rather than laying the see-through dot over the yellow of the find, which washed it out, and keeps the dot of a space selected as it was', () => {
    const { frame } = drawn(
      [
        { text: ' ', mark: 'match' },
        { text: ' ', mark: 'match', selected: true },
        { text: ' ' },
      ],
      { blanks: true, tinted: { ...look, dot: [255, 255, 255, 0.5] } },
    );

    assert.deepStrictEqual(
      rectsIn(frame)
        .filter(({ width }) => width === 2)
        .map(({ color }) => color),
      [matchInk, 0xffbca793, 0xff6d6d6d],
    );
  });

  test('frames the find the search is at with a hairline in the ink of a find, above and below within its row and before and after it, once around what several pieces hold', () => {
    const { frame } = drawn([
      { text: 'a' },
      { text: 'bc', kind: 'keyword', mark: 'current' },
      { text: 'd', mark: 'current' },
    ]);

    assert.deepStrictEqual(
      rectsIn(frame)
        .filter(({ color }) => color === 0xff000000)
        .map(({ x, y, width, height }) => [x, y, width, height]),
      [
        [7, 0, 14, 1],
        [7, 15, 14, 1],
        [6, 0, 1, 16],
        [21, 0, 7, 1],
        [21, 15, 7, 1],
        [28, 0, 1, 16],
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

  test('draws the text of a tinted row on that tint, and a piece of a tint of its own on both, one over the other, laying a ground only under the piece whose ground is not that of its row, as the tint of a row is laid once across it', () => {
    const { frame, painter } = drawn(
      [{ text: 'a' }, { text: 'b', tint: 'added+word' }],
      { tint: 'added', tinted: tintedLook },
    );

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ground }) => [shown, ground]),
      [
        ['a', 'rgb(8 136 8)'],
        ['b', 'rgb(132 196 132)'],
      ],
    );
    assert.deepStrictEqual(rectsIn(frame), [
      { x: 7, y: 0, width: 7, height: 16, color: 0xff84c484 },
    ]);
  });

  test('lays a mark that is see-through over the tint under it, so what is marked on a tinted row keeps some of its tint, and what is selected takes the color of a selection whatever is under it', () => {
    const { painter } = drawn(
      [
        { text: 'a', mark: 'occurrence' },
        { text: 'b', selected: true },
      ],
      { tint: 'added', tinted: tintedLook },
    );

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ground }) => [shown, ground]),
      [
        ['a', 'rgb(132 68 4)'],
        ['b', 'rgb(38 79 120)'],
      ],
    );
  });

  test('starts the text as far into the canvas as it is told, its grounds and its dots with it, as a canvas that draws line numbers too starts its text after them', () => {
    const { frame } = drawn([{ text: 'a b', mark: 'match' }], {
      blanks: true,
      left: 100,
      first: 1,
    });

    assert.deepStrictEqual(
      tilesIn(frame).map(({ x }) => x + padX),
      [93, 107],
    );
    assert.deepStrictEqual(rectsIn(frame), [
      { x: 93, y: 0, width: 21, height: 16, color: yellow },
      { x: 102, y: 7, width: 2, height: 2, color: matchInk },
    ]);
  });

  test('marks a place where the other line has words this one lacks with a bar two hairlines wide between its characters, in the tint of a changed word', () => {
    const { frame } = drawn(
      [{ text: 'ab' }, { text: 'cd', gapBefore: 'added+word' }],
      { tint: 'added', tinted: tintedLook },
    );

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 13, y: 0, width: 2, height: 16, color: 0xff84c484 },
    ]);
  });

  test('ends the digits of a line number where its column ends, in the muted ink on the tint of its row', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter);
    const frame = new CellFrame();

    drawDigits(
      { tiles, frame, palette: paletteOf(tintedLook) },
      '12',
      50,
      16,
      'added',
    );

    assert.deepStrictEqual(
      painter.painted.map(({ shown, ink, ground }) => [shown, ink, ground]),
      [
        ['1', 'muted', 'rgb(8 136 8)'],
        ['2', 'muted', 'rgb(8 136 8)'],
      ],
    );
    assert.deepStrictEqual(
      tilesIn(frame).map(({ x, y }) => [x + padX, y + padY]),
      [
        [36, 16],
        [43, 16],
      ],
    );
  });
});
