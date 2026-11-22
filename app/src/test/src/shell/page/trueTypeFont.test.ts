import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  readTrueTypeFont,
  trueTypeFont,
} from '../../../../shell/page/trueTypeFont';

const box = { left: 100, bottom: -50, right: 400, top: 700 };

const drawn = {
  family: 'Test Controls',
  unitsPerEm: 1000,
  ascent: 700,
  descent: 150,
  glyphs: [
    { advance: 600, boxes: [] },
    { advance: 600, boxes: [box] },
    { advance: 600, boxes: [box, { ...box, left: 450, right: 500 }] },
  ],
  glyphOfCode: new Map([
    [1, 1],
    [2, 2],
    [0x7f, 2],
    [0x2401, 1],
    [0x2402, 2],
  ]),
};

const tagsOf = (font: Uint8Array) =>
  Array.from({ length: font[5] ?? 0 }, (_, table) =>
    String.fromCharCode(...font.subarray(12 + table * 16, 16 + table * 16)),
  );

suite('TrueType font made of boxes', () => {
  test('holds the tables a browser asks of a font, in the order of their names, each summed, and the whole summed to the number TrueType asks for, as Chromium turns away a font whose sums or tables are off', () => {
    const font = trueTypeFont(drawn);
    assert.deepStrictEqual(tagsOf(font), [
      'OS/2',
      'cmap',
      'glyf',
      'head',
      'hhea',
      'hmtx',
      'loca',
      'maxp',
      'name',
      'post',
    ]);
    assert.strictEqual(font.length % 4, 0);
    assert.strictEqual(readTrueTypeFont(font).sumsHold, true);
    const broken = font.slice();
    broken[font.length - 1] = (broken[font.length - 1] ?? 0) ^ 1;
    assert.strictEqual(readTrueTypeFont(broken).sumsHold, false);
  });

  test('maps each code to its glyph, a control character and its picture to the same one, every glyph as wide as a column, a box a contour', () => {
    const read = readTrueTypeFont(trueTypeFont(drawn));
    assert.deepStrictEqual(
      [...read.glyphOfCode].toSorted(([one], [other]) => one - other),
      [
        [1, 1],
        [2, 2],
        [0x7f, 2],
        [0x2401, 1],
        [0x2402, 2],
      ],
    );
    assert.deepStrictEqual(read.advances, [600, 600, 600]);
    assert.deepStrictEqual(read.contours, [0, 1, 2]);
    assert.deepStrictEqual(
      [read.unitsPerEm, read.ascent, read.descent],
      [1000, 700, 150],
    );
  });

  test('makes the same bytes of the same drawing, with no date in them', () => {
    assert.deepStrictEqual(trueTypeFont(drawn), trueTypeFont(drawn));
  });
});
