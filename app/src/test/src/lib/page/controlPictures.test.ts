import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  hasControls,
  hasPictures,
  hasSwapped,
  pictured,
  swappedCharacters,
  unpictured,
} from '../../../../lib/page/controlPictures';

const character = (code: number) => String.fromCharCode(code);

const formFeed = character(12);

const drawnByTheFont = [
  ...Array.from({ length: 32 }, (_, code) => code).filter(
    (code) => code !== 9 && code !== 10 && code !== 12 && code !== 13,
  ),
  127,
];

suite('Control pictures', () => {
  test('swaps the form feed alone for the picture Unicode has for it, 9216 code points on, as Chromium draws it as nothing whatever font has it, and leaves every other control character in the text, where the font of the app draws it', () => {
    assert.strictEqual(pictured(`a${formFeed}b`), 'a␌b');
    for (const code of drawnByTheFont) {
      const text = `a${character(code)}b`;
      assert.strictEqual(pictured(text), text, String(code));
      assert.strictEqual(hasSwapped(text), false, String(code));
    }
    assert.strictEqual(hasSwapped(`a${formFeed}`), true);
    assert.deepStrictEqual(
      Array.from(
        `a${formFeed}\u001b${formFeed}`.matchAll(swappedCharacters()),
        (found) => found.index,
      ),
      [1, 3],
    );
  });

  test('leaves the tab, the line feed and the carriage return, which the views draw themselves, and every other character as they are, a text without a form feed the very string it was', () => {
    const plain = 'a\tb\r\nc é 中 😀 \u0080 \u009f \u001b';
    assert.strictEqual(pictured(plain), plain);
    assert.strictEqual(hasControls('a\tb\r\nc é 中'), false);
  });

  test('tells a text with a control character the font draws a column wide, the form feed too, drawn as its picture', () => {
    for (const code of [...drawnByTheFont, 12]) {
      assert.strictEqual(
        hasControls(`a${character(code)}`),
        true,
        String(code),
      );
    }
  });

  test('keeps a text as long as it was, a character for a character, so every place counted in it still holds', () => {
    const text = `${formFeed}x${formFeed}${formFeed}y`;
    assert.strictEqual(pictured(text).length, text.length);
  });

  test('gives the form feed back from its picture, and leaves the pictures the swap never makes, as that of the escape, which a file holds itself', () => {
    const text = `a${formFeed}b${formFeed}`;
    assert.strictEqual(unpictured(pictured(text)), text);
    assert.strictEqual(unpictured('␉␊␍␠␛␡ plain'), '␉␊␍␠␛␡ plain');
  });

  test('tells a text that holds the picture the swap makes from one that holds none', () => {
    assert.strictEqual(hasPictures('a␌b'), true);
    assert.strictEqual(hasPictures(`␛␡␉␊␍␠ ${formFeed}`), false);
  });
});
