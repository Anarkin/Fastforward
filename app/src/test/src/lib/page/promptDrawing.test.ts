import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { PixelBox } from '../../../../lib/page/iconPixels';
import { promptDrawing } from '../../../../lib/page/promptDrawing';

const sizes = Array.from({ length: 49 }, (_, at) => 16 + at);

const bottomOf = (box: PixelBox) => box.y + box.height;
const rightOf = (box: PixelBox) => box.x + box.width;

const withEnds = (size: number) => {
  const drawing = promptDrawing(size);
  return {
    ...drawing,
    first: drawing.chevron[0],
    last: drawing.chevron.at(-1),
  };
};

const row = (x: number, y: number) => ({ x, y, width: 2, height: 1 });

suite('Prompt drawing', () => {
  test('draws the prompt at 100% on the 16 pixels of a tool icon as designed, a > of seven rows and an underscore on its last', () => {
    assert.deepStrictEqual(promptDrawing(16), {
      size: 16,
      frame: { x: 1, y: 2, width: 14, height: 13 },
      rounding: 1,
      screen: { x: 2, y: 3, width: 12, height: 11 },
      chevron: [
        row(3, 5),
        row(4, 6),
        row(5, 7),
        row(6, 8),
        row(5, 9),
        row(4, 10),
        row(3, 11),
      ],
      underscore: { x: 9, y: 11, width: 4, height: 1 },
    });
  });

  test('puts every edge of the frame, the screen, the > and the underscore on whole pixels at every scale, so the green never blurs into the black', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { frame, screen, chevron, underscore } = promptDrawing(size);
        return ![frame, screen, underscore, ...chevron].every((box) =>
          [box.x, box.y, box.width, box.height].every(Number.isInteger),
        );
      }),
      [],
    );
  });

  test('centers the > on the screen exactly, with black above and below it, at every scale', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { screen, first, last } = withEnds(size);
        return (
          !first ||
          !last ||
          first.y - screen.y < 1 ||
          first.y - screen.y !== bottomOf(screen) - bottomOf(last)
        );
      }),
      [],
    );
  });

  test('centers the prompt across the screen within a pixel, with black on either side, at every scale', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { screen, first, underscore } = withEnds(size);
        if (!first) {
          return true;
        }
        const before = first.x - screen.x;
        const after = rightOf(screen) - rightOf(underscore);
        return before < 1 || after < 1 || Math.abs(before - after) > 1;
      }),
      [],
    );
  });

  test('stands the underscore on the last row of the >, right of it, at every scale', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { chevron, last, underscore } = withEnds(size);
        return (
          !last ||
          bottomOf(underscore) !== bottomOf(last) ||
          underscore.x <= Math.max(...chevron.map(rightOf))
        );
      }),
      [],
    );
  });

  test('keeps the > 2 pixels wide up to 150%, as 3 looked too heavy at 125%', () => {
    assert.deepStrictEqual(
      [16, 17, 18, 19, 20, 21, 22, 23, 24].filter((size) =>
        promptDrawing(size).chevron.some((box) => box.width !== 2),
      ),
      [],
    );
  });
});
