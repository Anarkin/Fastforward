import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { characterLines } from '../../../../../components/cells/page/characterNames';
import { blankSignOf } from '../../../../../lib/page/blankSigns';
import { invisibleParts } from '../../../../../lib/page/invisibles';

const drawnAsSign = (character: string): boolean =>
  blankSignOf(character, false) !== undefined ||
  invisibleParts(character)?.some((part) => part.hidden) === true;

suite('Character names', () => {
  test('names a character by its code point and its Unicode name, a line each', () => {
    assert.deepStrictEqual(characterLines('\u200b\u00a0\u2800'), [
      'U+200B ZERO WIDTH SPACE',
      'U+00A0 NO-BREAK SPACE',
      'U+2800 BRAILLE PATTERN BLANK',
    ]);
  });

  test('names a control by the name it is known by, as Unicode gives a control no name of its own', () => {
    assert.deepStrictEqual(characterLines('\u0000\u0007\u001b\u007f\u0085'), [
      'U+0000 NULL',
      'U+0007 BELL',
      'U+001B ESCAPE',
      'U+007F DELETE',
      'U+0085 NEXT LINE',
    ]);
  });

  test('names the variation selectors, the tags, a noncharacter and a code point not assigned yet', () => {
    assert.deepStrictEqual(
      characterLines('\ufe0f\u{e0100}\u{e01ef}\u{e0041}\uffff\u{10fffe}\u2065'),
      [
        'U+FE0F VARIATION SELECTOR-16',
        'U+E0100 VARIATION SELECTOR-17',
        'U+E01EF VARIATION SELECTOR-256',
        'U+E0041 TAG LATIN CAPITAL LETTER A',
        'U+FFFF Noncharacter',
        'U+10FFFE Noncharacter',
        'U+2065 Unassigned',
      ],
    );
  });

  test('names every assigned character the app draws as a sign, so no tooltip of one says it is unassigned', () => {
    const unnamed: string[] = [];
    for (let code = 0; code <= 0x10ffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) {
        continue;
      }
      const character = String.fromCodePoint(code);
      if (!drawnAsSign(character) || /\p{Cn}/u.test(character)) {
        continue;
      }
      const [line = ''] = characterLines(character);
      if (/ (?:Unassigned|Noncharacter)$/.test(line)) {
        unnamed.push(line);
      }
    }
    assert.deepStrictEqual(unnamed, []);
  });
});
