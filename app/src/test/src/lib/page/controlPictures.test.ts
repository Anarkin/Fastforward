import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  hasControls,
  hasPictures,
  pictured,
  unpictured,
} from '../../../../lib/page/controlPictures';

const character = (code: number) => String.fromCharCode(code);

const swapped = [
  ...Array.from({ length: 32 }, (_, code) => code).filter(
    (code) => code !== 9 && code !== 10 && code !== 13,
  ),
  127,
];

suite('Control pictures', () => {
  test('draws each control character as the picture Unicode has for it, 9216 code points on and the delete at 9249, as VS Code does, since no font draws the characters themselves and Chromium looked for one at each', () => {
    for (const code of swapped) {
      assert.strictEqual(
        pictured(`a${character(code)}b`),
        `a${character(code === 127 ? 0x2421 : 0x2400 + code)}b`,
        String(code),
      );
    }
    assert.strictEqual(pictured('\u0001\u001b[0m\u007f'), '␁␛[0m␡');
  });

  test('leaves the tab, the line feed and the carriage return, which the views draw themselves, and every other character as they are, a text without control characters the very string it was', () => {
    const plain = 'a\tb\r\nc é 中 😀 \u0080 \u009f';
    assert.strictEqual(pictured(plain), plain);
    assert.strictEqual(hasControls(plain), false);
    assert.strictEqual(hasControls('a\u0007'), true);
  });

  test('keeps a text as long as it was, a character for a character, so every place counted in it still holds', () => {
    const text = swapped.map(character).join('x');
    assert.strictEqual(pictured(text).length, text.length);
  });

  test('gives the characters back from their pictures, and leaves the pictures the swap never makes, of the tab, the line feed, the carriage return and the space', () => {
    const text = `a${swapped.map(character).join('')}b`;
    assert.strictEqual(unpictured(pictured(text)), text);
    assert.strictEqual(unpictured('␉␊␍␠ plain'), '␉␊␍␠ plain');
  });

  test('tells a text that holds a picture the swap makes from one that holds none', () => {
    assert.strictEqual(hasPictures('a␛b'), true);
    assert.strictEqual(hasPictures('a␡b'), true);
    assert.strictEqual(hasPictures('␉␊␍␠ \u001b'), false);
  });
});
