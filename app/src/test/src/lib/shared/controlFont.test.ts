import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  codesOfControlFont,
  controlCodes,
  controlOfPicture,
  nameOfControlFontCode,
  pictureOfControl,
  unicodeRangeOf,
} from '../../../../lib/shared/controlFont';

suite('Font of the control characters', () => {
  test('draws every control character but the tab, the line feed and the carriage return, which the views draw themselves, a column wide', () => {
    assert.deepStrictEqual(
      controlCodes,
      [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22,
        23, 24, 25, 26, 27, 28, 29, 30, 31, 127,
      ],
    );
  });

  test('covers each control character where it stands in the text, but the form feed, which Chromium draws as nothing whatever font has it, and every picture Unicode has for them, so a control character and its picture a file holds look alike whatever the font of the user has', () => {
    assert.strictEqual(
      unicodeRangeOf(codesOfControlFont),
      'U+0-8, U+B, U+E-1F, U+7F, U+2400-2421',
    );
    assert.strictEqual(unicodeRangeOf([3, 1, 2, 9, 0x41]), 'U+1-3, U+9, U+41');
  });

  test('names each by the abbreviation of its control character, the delete and the space of the pictures too', () => {
    assert.strictEqual(nameOfControlFontCode(0), 'NUL');
    assert.strictEqual(nameOfControlFontCode(27), 'ESC');
    assert.strictEqual(nameOfControlFontCode(0x241b), 'ESC');
    assert.strictEqual(nameOfControlFontCode(0x240c), 'FF');
    assert.strictEqual(nameOfControlFontCode(127), 'DEL');
    assert.strictEqual(nameOfControlFontCode(0x2421), 'DEL');
    assert.strictEqual(nameOfControlFontCode(0x2420), 'SP');
    assert.deepStrictEqual(
      codesOfControlFont.filter((code) => nameOfControlFontCode(code) === ''),
      [],
    );
  });

  test('finds the picture of a control character 9216 code points on, the delete at 9249, and the character back from it', () => {
    assert.strictEqual(pictureOfControl(12), 0x240c);
    assert.strictEqual(pictureOfControl(127), 0x2421);
    for (const code of controlCodes) {
      assert.strictEqual(controlOfPicture(pictureOfControl(code)), code);
    }
  });
});
