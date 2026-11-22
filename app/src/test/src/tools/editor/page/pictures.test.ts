import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { picturesIn } from '../../../../../tools/editor/page/pictures';

suite('Control pictures of the editor', () => {
  test('replaces each form feed of the ranges drawn by its picture and no other control character, which the font of the app draws where it stands in the text, however many a line holds, as an element for the picture of each took the editor longer to paint at every frame than the characters took Chromium to lay out, so a file dense in them was left as it was, in boxes and off the columns', () => {
    const formFeed = String.fromCharCode(12);
    const escape = String.fromCharCode(27);
    const text = `a${formFeed}${escape.repeat(40)}${formFeed}b\u0001\u007f${formFeed}`;
    const textOf = (from: number, to: number) => text.slice(from, to);
    assert.deepStrictEqual(
      picturesIn([{ from: 0, to: text.length }], textOf).map(({ from, to }) => [
        from,
        to,
      ]),
      [
        [1, 2],
        [42, 43],
        [46, 47],
      ],
    );
    assert.deepStrictEqual(
      picturesIn(
        [
          { from: 0, to: 1 },
          { from: 40, to: 44 },
        ],
        textOf,
      ).map(({ from, to }) => [from, to]),
      [[42, 43]],
    );
  });
});
