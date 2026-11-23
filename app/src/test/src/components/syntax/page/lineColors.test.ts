import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  lineColors,
  segmentColors,
  segmentsOfLine,
} from '../../../../../components/syntax/page/lineColors';

const token = (text: string, piece: string, kind: string, from = 0) => {
  const start = text.indexOf(piece, from);
  return { start, end: start + piece.length, kind };
};

suite('The colors of a line', () => {
  test('take the color most of its tokens have for the line itself, leaving those tokens no range of their own and giving the text between tokens one, plain, as an element for every token made eight of ten elements of a screen of code color spans, most of them the punctuation of one color: a screen of a diff held 2,480 elements rather than 1,640, and its wheel, its scrollbar dragged and opening took a tenth to a sixth longer', () => {
    const text = 'const a = [b(1), c];';
    const tokens = [
      token(text, 'const', 'keyword'),
      token(text, '=', 'keyword'),
      token(text, '[', 'keyword'),
      token(text, 'b', 'function'),
      token(text, '(', 'keyword'),
      token(text, '1', 'number'),
      token(text, '),', 'keyword'),
      token(text, '];', 'keyword'),
    ];
    assert.deepStrictEqual(lineColors(text, tokens), {
      common: 'keyword',
      others: [
        { start: 5, end: 8, kind: 'plain' },
        token(text, 'b', 'function'),
        token(text, '1', 'number'),
        { start: 16, end: 18, kind: 'plain' },
      ],
    });
  });

  test('stay as they are in a line where no color has more tokens than there are stretches of text between tokens, which then need no element, as most lines of prose and a line that is one string', () => {
    const text = 'alpha beta = gamma';
    const tokens = [token(text, '=', 'keyword')];
    const colors = lineColors(text, tokens);
    assert.strictEqual(colors.common, undefined);
    assert.strictEqual(colors.others, tokens);
    const none: { start: number; end: number; kind: string }[] = [];
    assert.deepStrictEqual(lineColors('plain words', none), {
      common: undefined,
      others: none,
    });
    const even = 'a = b;';
    assert.strictEqual(
      lineColors(even, [
        token(even, '=', 'keyword'),
        token(even, ';', 'keyword'),
      ]).common,
      undefined,
    );
  });

  test('are told alike of a row cut into pieces of text, as the viewer has its rows: the pieces of the most common color lose it and run together with the blanks beside them into one piece, the pieces between tokens take the plain color, and a row with no such color stays as it is', () => {
    const pieces = [
      { text: 'let', kind: 'keyword' },
      { text: ' a ' },
      { text: '=', kind: 'keyword' },
      { text: ' ' },
      { text: '[', kind: 'keyword' },
      { text: '1', kind: 'number' },
      { text: ']', kind: 'keyword' },
      { text: ';', kind: 'keyword' },
    ];
    assert.deepStrictEqual(segmentColors(pieces), {
      common: 'keyword',
      others: [
        { text: 'let' },
        { text: ' a ', kind: 'plain' },
        { text: '= [' },
        { text: '1', kind: 'number' },
        { text: '];' },
      ],
    });
    const prose = [{ text: 'alpha ' }, { text: '=', kind: 'keyword' }];
    const kept = segmentColors([...prose, { text: ' beta' }]);
    assert.strictEqual(kept.common, undefined);
    assert.deepStrictEqual(kept.others, [...prose, { text: ' beta' }]);
    const uncolored = [{ text: 'plain words' }];
    assert.strictEqual(segmentColors(uncolored).others, uncolored);
  });

  test('give no range to a stretch between tokens that draws nothing, spaces, tabs and line ends, whose signs have a color of their own, but one to a stretch of other blanks alone, as a vertical tab and a form feed are drawn as their pictures in the color of the text', () => {
    const formFeed = String.fromCharCode(12);
    const text = `( \t) ${formFeed} [ ]`;
    const tokens = [
      token(text, '(', 'keyword'),
      token(text, ')', 'keyword'),
      token(text, '[', 'keyword'),
      token(text, ']', 'keyword'),
    ];
    assert.deepStrictEqual(lineColors(text, tokens), {
      common: 'keyword',
      others: [{ start: 4, end: 7, kind: 'plain' }],
    });
  });

  test('cuts a line into the pieces of its colors, the text between two colored pieces a piece of no color, so the cells color a line of a diff or of a text edited as they color a file viewed', () => {
    assert.deepStrictEqual(
      segmentsOfLine('const a = 1;', [
        { start: 0, end: 5, kind: 'keyword' },
        { start: 10, end: 11, kind: 'number' },
      ]),
      [
        { text: 'const', kind: 'keyword' },
        { text: ' a = ' },
        { text: '1', kind: 'number' },
        { text: ';' },
      ],
    );
    assert.deepStrictEqual(segmentsOfLine('plain', []), [{ text: 'plain' }]);
  });
});
