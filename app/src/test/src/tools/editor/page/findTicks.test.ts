import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  currentTickOf,
  ticksOf,
} from '../../../../../tools/editor/page/findTicks';

const rounded = (ticks: ReturnType<typeof ticksOf>) =>
  ticks.map(({ top, height }) => ({
    top: Math.round(top * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  }));

suite('The marks of a find on the scrollbar of the editor', () => {
  test('marks each line with a match at its share of the height the text scrolls through, as tall as the line, so the thumb comes to stand at the mark once the line is at the top', () => {
    assert.deepStrictEqual(
      rounded(
        ticksOf(
          [
            { top: 0, bottom: 20 },
            { top: 500, bottom: 520 },
          ],
          1000,
          400,
        ),
      ),
      [
        { top: 0, height: 0.02 },
        { top: 0.5, height: 0.02 },
      ],
    );
  });

  test('draws a mark two pixels of the track tall at least, and joins marks that would touch, so a line too short for a pixel still shows and many lines close together show as one', () => {
    assert.deepStrictEqual(
      rounded(
        ticksOf(
          [
            { top: 100, bottom: 101 },
            { top: 103, bottom: 104 },
            { top: 900, bottom: 901 },
          ],
          10_000,
          200,
        ),
      ),
      [
        { top: 0.01, height: 0.01 },
        { top: 0.09, height: 0.01 },
      ],
    );
  });

  test('marks nothing in a text of no height', () => {
    assert.deepStrictEqual(ticksOf([{ top: 0, bottom: 20 }], 0, 400), []);
  });

  test('marks the line of the current match orange over the others, two pixels of the track tall at least, and nothing without one', () => {
    assert.deepStrictEqual(
      [
        currentTickOf({ top: 500, bottom: 520 }, 1000, 400),
        currentTickOf({ top: 500, bottom: 501 }, 1000, 400),
        currentTickOf(undefined, 1000, 400),
        currentTickOf({ top: 0, bottom: 20 }, 0, 400),
      ],
      [
        { top: 0.5, height: 0.02 },
        { top: 0.5, height: 0.005 },
        undefined,
        undefined,
      ],
    );
  });
});
