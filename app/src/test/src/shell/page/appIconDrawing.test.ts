import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { appIconDrawing } from '../../../../shell/page/appIconDrawing';

const renderedSizes = [
  16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256, 512, 604,
];

function edgesOf(size: number): readonly number[] {
  const { tabTop, backTop, frontTop } = appIconDrawing(size);
  return [tabTop, backTop, frontTop];
}

suite('App icon drawing', () => {
  test('puts the edges between the sky, the back of the folder and its front on whole pixels at every size it is rendered at, so no row of pixels blends two of them', () => {
    assert.deepStrictEqual(
      renderedSizes.filter((size) => !edgesOf(size).every(Number.isInteger)),
      [],
    );
  });

  test('moves no edge more than half a pixel from where the drawing puts it', () => {
    const drawn = appIconDrawing();
    const drawnEdges = edgesOf(drawn.size);
    assert.deepStrictEqual(
      renderedSizes.filter((size) =>
        edgesOf(size).some(
          (edge, index) =>
            Math.abs(edge - ((drawnEdges[index] ?? 0) * size) / drawn.size) >
            0.5,
        ),
      ),
      [],
    );
  });

  test('keeps the sky, the step of the tab, the back of the folder and its front at least a pixel tall in the 8 pixels the disc takes on the plate of the smallest macOS icon, so each still shows', () => {
    const [tabTop = 0, backTop = 0, frontTop = 0] = edgesOf(8);
    assert.deepStrictEqual(
      [tabTop, backTop - tabTop, frontTop - backTop, 8 - frontTop].filter(
        (height) => height < 1,
      ),
      [],
    );
  });
});
