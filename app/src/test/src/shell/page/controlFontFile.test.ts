import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  codesOfControlFont,
  nameOfControlFontCode,
} from '../../../../lib/shared/controlFont';
import {
  controlFont,
  fontCellOf,
} from '../../../../shell/page/controlFontFile';
import { readTrueTypeFont } from '../../../../shell/page/trueTypeFont';

suite('Font file of the control characters', () => {
  test('gives every control character and every picture of one a glyph a column wide, the character and its picture the same one, an empty glyph for anything else', () => {
    const read = readTrueTypeFont(
      controlFont({ unitsPerEm: 1000, advance: 600 }),
    );
    assert.strictEqual(read.sumsHold, true);
    assert.deepStrictEqual(
      [...read.glyphOfCode.keys()].toSorted((one, other) => one - other),
      codesOfControlFont.toSorted((one, other) => one - other),
    );
    assert.deepStrictEqual([...new Set(read.advances)], [600]);
    assert.strictEqual(read.contours[0], 0);
    assert.deepStrictEqual(
      read.contours.slice(1).filter((contours) => contours === 0),
      [],
    );
    for (const code of codesOfControlFont) {
      const twin = codesOfControlFont.find(
        (other) =>
          other !== code &&
          nameOfControlFontCode(other) === nameOfControlFontCode(code),
      );
      if (twin !== undefined) {
        assert.strictEqual(
          read.glyphOfCode.get(code),
          read.glyphOfCode.get(twin),
          String(code),
        );
      }
    }
    assert.strictEqual(
      read.glyphOfCode.get(0x1b),
      read.glyphOfCode.get(0x241b),
    );
    assert.notStrictEqual(
      read.glyphOfCode.get(0x1b),
      read.glyphOfCode.get(0x7f),
    );
  });

  test('keeps its ascent and descent below those of any font of text, so a control character never makes a line taller than its text does', () => {
    const read = readTrueTypeFont(
      controlFont({ unitsPerEm: 2048, advance: 1126 }),
    );
    assert.deepStrictEqual(
      [read.unitsPerEm, read.ascent, read.descent],
      [2048, 1434, 307],
    );
  });

  test('finds the units of a font whose column is exactly as wide as a character of the font of the user, as Chromium counts it in 65536ths of a pixel, as a font of one width scaled to it came out up to 0.004 pixels off a character, the size it was scaled to cut to hundredths of a pixel, and a line of 200 control characters ended most of a pixel short', () => {
    assert.deepStrictEqual(fontCellOf(7.1999969482421875, 12), {
      unitsPerEm: 1000,
      advance: 600,
    });
    assert.deepStrictEqual(fontCellOf(6.59765625, 12), {
      unitsPerEm: 1024,
      advance: 563,
    });
    for (const [zero, size] of [
      [7.80126953125, 13],
      [8.203125, 14],
      [9.03125, 15.5],
      [6.0000305, 11],
    ] as const) {
      const cell = fontCellOf(zero, size);
      assert.ok(cell !== undefined);
      assert.ok(cell.unitsPerEm >= 1000 && cell.unitsPerEm <= 16384);
      assert.ok(
        Math.abs((cell.advance / cell.unitsPerEm) * size - zero) < 2 / 65536,
        `${zero} at ${size}: ${JSON.stringify(cell)}`,
      );
    }
  });

  test('makes no font while the font of the user has no width yet', () => {
    assert.strictEqual(fontCellOf(0, 12), undefined);
    assert.strictEqual(fontCellOf(7.2, Number.NaN), undefined);
  });
});
