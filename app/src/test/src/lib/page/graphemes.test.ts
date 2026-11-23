import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { clusterBreak, graphemes } from '../../../../lib/page/graphemes';

const units = (text: string) =>
  Array.from(graphemes.segment(text), ({ segment }) => segment);

suite('Units of a text', () => {
  test('cuts a text into the clusters of Unicode but for the characters that show nothing, each a unit of its own as it is drawn on a cell of its own, whether it joins the character before it or the one after it, and a skin tone after a letter, so a selection, a cursor and a deletion step over each as it is drawn, as a tag joined to the letter before it was selected with that letter', () => {
    assert.deepStrictEqual(units('x\u{E0067}\u{E0067}x'), [
      'x',
      '\u{E0067}',
      '\u{E0067}',
      'x',
    ]);
    assert.deepStrictEqual(units('x\u0890\u0890x'), [
      'x',
      '\u0890',
      '\u0890',
      'x',
    ]);
    assert.deepStrictEqual(units('a\u{1F3FB}b'), ['a', '\u{1F3FB}', 'b']);
    assert.deepStrictEqual(units('|\uFE0F|'), ['|', '\uFE0F', '|']);
  });

  test('keeps an emoji, a flag, a keycap and a letter with its accents one unit, as they draw as one picture', () => {
    for (const whole of [
      '👨\u200D👩\u200D👧',
      '❤\uFE0F',
      '1\uFE0F⃣',
      '🇭🇺',
      '👍🏽',
      'e\u0301',
    ]) {
      assert.deepStrictEqual(units(`a${whole}b`), ['a', whole, 'b'], whole);
    }
  });

  test('finds the unit around an index, the one a character that shows nothing makes too', () => {
    const text = 'x\u0890\u0890x';
    const found = graphemes.segment(text).containing(1);

    assert.deepStrictEqual(
      { segment: found?.segment, index: found?.index },
      { segment: '\u0890', index: 1 },
    );
    assert.strictEqual(graphemes.segment(text).containing(4), undefined);
  });

  test('steps forward and back over a unit, as a cursor moves and a key deletes, a character that shows nothing alone and an emoji whole', () => {
    const text = 'a\u200D\u200Db👨\u200D👩c';

    assert.deepStrictEqual(
      [0, 1, 2, 3, 4].map((at) => clusterBreak(text, at, true)),
      [1, 2, 3, 4, 9],
    );
    assert.deepStrictEqual(
      [9, 4, 3, 2, 1].map((at) => clusterBreak(text, at, false)),
      [4, 3, 2, 1, 0],
    );
    assert.strictEqual(clusterBreak(text, text.length, true), text.length);
    assert.strictEqual(clusterBreak(text, 0, false), 0);
  });
});
