import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  controlNames,
  deleteName,
  spaceName,
} from '../../../../lib/shared/controlFont';
import {
  dotsAcross,
  pictureBoxes,
  pictureDots,
  pictureLetters,
} from '../../../../shell/page/controlFontDrawing';

const names = [...controlNames, spaceName, deleteName];

function drawn(name: string): string[] {
  const dots = pictureDots(name);
  return Array.from({ length: 11 }, (_, row) =>
    Array.from({ length: 7 }, (__, column) =>
      dots.some(
        (dot) =>
          column >= dot.left &&
          column < dot.right &&
          8 - row >= dot.bottom &&
          8 - row < dot.top,
      )
        ? '#'
        : '.',
    ).join(''),
  );
}

suite('Drawing of the control pictures', () => {
  test('draws a control character as the first and the last letter of its name, as its picture in JetBrains Mono, three letters being too small to read in a column, no two alike', () => {
    assert.deepStrictEqual(pictureLetters('ESC'), ['E', 'C']);
    assert.deepStrictEqual(pictureLetters('BS'), ['B', 'S']);
    assert.deepStrictEqual(pictureLetters('DC3'), ['D', '3']);
    assert.strictEqual(
      new Set(names.map((name) => pictureLetters(name).join(''))).size,
      names.length,
    );
  });

  test('sets the first letter at the top left and the last at the bottom right of the cell, a dot apart, from two dots below the line to nine above', () => {
    assert.deepStrictEqual(drawn('ESC'), [
      '###....',
      '#......',
      '##.....',
      '#......',
      '###....',
      '.......',
      '.....##',
      '....#..',
      '....#..',
      '....#..',
      '.....##',
    ]);
  });

  test('draws every name, each inside the 7.2 dots a column is across', () => {
    for (const name of names) {
      const dots = pictureDots(name);
      assert.ok(dots.length > 0, name);
      for (const { left, right, bottom, top } of dots) {
        assert.ok(left >= 0 && right <= Math.floor(dotsAcross), name);
        assert.ok(bottom >= -2 && top <= 9 && bottom < top, name);
      }
    }
  });

  test('scales the dots to the units of the font by the advance of a column, each edge on a whole unit, so a dot is a whole pixel where the advance is 7.2 of them, as JetBrains Mono at 12 pixels', () => {
    assert.deepStrictEqual(pictureBoxes('ESC', 720)[0], {
      left: 0,
      right: 300,
      top: 900,
      bottom: 800,
    });
    assert.deepStrictEqual(pictureBoxes('ESC', 600)[0], {
      left: 0,
      right: 250,
      top: 750,
      bottom: 667,
    });
    assert.deepStrictEqual(
      pictureBoxes('US', 563).filter(
        (box) =>
          !Number.isInteger(box.left) ||
          !Number.isInteger(box.right) ||
          !Number.isInteger(box.top) ||
          !Number.isInteger(box.bottom) ||
          box.right > 563,
      ),
      [],
    );
  });
});
