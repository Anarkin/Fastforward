import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { floppyDrawing } from '../../../../lib/page/floppyDrawing';
import type { PixelBox } from '../../../../lib/page/iconPixels';

const sizes = Array.from({ length: 49 }, (_, at) => 16 + at);

const bottomOf = (box: PixelBox) => box.y + box.height;
const rightOf = (box: PixelBox) => box.x + box.width;

suite('Floppy drawing', () => {
  test('draws the floppy at 100% on the 16 pixels of a tool icon as designed, its shutter reaching the top edge and three red lines on its label', () => {
    assert.deepStrictEqual(floppyDrawing(16), {
      size: 16,
      disk: { x: 1, y: 1, width: 14, height: 14 },
      corner: 3,
      rounding: 1,
      shutter: { x: 4, y: 1, width: 7, height: 5 },
      shutterWindow: { x: 8, y: 2, width: 2, height: 3 },
      label: { x: 3, y: 7, width: 10, height: 7 },
      lines: [
        { x: 4, y: 8, width: 8, height: 1 },
        { x: 4, y: 10, width: 8, height: 1 },
        { x: 4, y: 12, width: 8, height: 1 },
      ],
    });
  });

  test('puts every edge of the disk, its shutter, its window, its label and its lines on whole pixels at every scale, so no row of pixels blends the red into the white', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { disk, shutter, shutterWindow, label, lines } =
          floppyDrawing(size);
        return ![disk, shutter, shutterWindow, label, ...lines].every((box) =>
          [box.x, box.y, box.width, box.height].every(Number.isInteger),
        );
      }),
      [],
    );
  });

  test('draws the three red lines equally thick and equally far apart, with white above the first and below the last differing by a pixel at most, at every scale', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const {
          label,
          lines: [first, second, third],
        } = floppyDrawing(size);
        const above = first.y - label.y;
        const below = bottomOf(label) - bottomOf(third);
        return !(
          first.height === second.height &&
          second.height === third.height &&
          second.y > bottomOf(first) &&
          second.y - bottomOf(first) === third.y - bottomOf(second) &&
          above > 0 &&
          below > 0 &&
          Math.abs(above - below) <= 1
        );
      }),
      [],
    );
  });

  test('keeps blue between the shutter and the clipped corner, between the shutter and the label, below the label and around the window of the shutter, at every scale', () => {
    assert.deepStrictEqual(
      sizes.filter((size) => {
        const { disk, corner, shutter, shutterWindow, label } =
          floppyDrawing(size);
        return !(
          rightOf(shutter) < rightOf(disk) - corner + (shutter.y - disk.y) &&
          bottomOf(shutter) < label.y &&
          bottomOf(label) < bottomOf(disk) &&
          shutterWindow.height > 0 &&
          shutterWindow.y > shutter.y &&
          bottomOf(shutterWindow) < bottomOf(shutter) &&
          shutterWindow.x > shutter.x &&
          rightOf(shutterWindow) < rightOf(shutter)
        );
      }),
      [],
    );
  });
});
