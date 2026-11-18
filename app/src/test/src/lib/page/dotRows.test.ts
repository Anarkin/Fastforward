import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dotLook } from '../../../../lib/page/dotLook';
import { dotsStyle } from '../../../../lib/page/dotRows';

const look = dotLook(14, 8, 1);

const dot = (column: number) =>
  `transparent 0 ${column * 8 + 3}px,currentColor 0 ${column * 8 + 5}px`;

const pattern =
  'repeating-linear-gradient(to right,transparent 0 3px,currentColor 0 5px,transparent 0 8px)';

const run = (from: number, length: number) =>
  Array.from({ length }, (_, at) => from + at);

suite('The dots of the spaces of rows', () => {
  test('draws the dots of a row as the stops of a gradient in plain pixels, on the row they belong to and only as wide as from its first dot to its last, as stops worked out from CSS variables took the browser 9 ms to resolve for each pair of lines scrolled into view', () => {
    assert.deepStrictEqual(dotsStyle([[1, 2, 5], [], [0]], look), {
      backgroundImage: `linear-gradient(to right,${dot(0)},${dot(1)},${dot(4)},transparent 0),linear-gradient(to right,${dot(0)},transparent 0)`,
      backgroundPosition:
        '8px var(--dot-top),0px calc(2 * var(--dot-row) + var(--dot-top))',
      backgroundSize: '40px var(--space-dot),8px var(--space-dot)',
    });
  });

  test('draws the dots of a row in gradients of at most 128 columns each, as a gradient as wide as a line of thousands of characters not wrapped lost its dots, the rows of a padded table with thirty dots in sight showing none', () => {
    const { backgroundImage, backgroundPosition, backgroundSize } = dotsStyle(
      [[0, 2, 100, 127, 128, 130, 300]],
      look,
    );
    assert.deepStrictEqual(
      [backgroundImage, backgroundPosition, backgroundSize],
      [
        [
          `linear-gradient(to right,${[0, 2, 100, 127].map(dot).join(',')},transparent 0)`,
          `linear-gradient(to right,${dot(0)},${dot(2)},transparent 0)`,
          `linear-gradient(to right,${dot(0)},transparent 0)`,
        ].join(','),
        '0px var(--dot-top),1024px var(--dot-top),2400px var(--dot-top)',
        '1024px var(--space-dot),24px var(--space-dot),8px var(--space-dot)',
      ],
    );
  });

  test('draws a run of eight spaces or more as one pattern of dots as wide as the run, however long it is, beside the gradients of the shorter runs of its row, as a stop for each dot of a table padded with spaces took the browser a millisecond a row to paint', () => {
    assert.deepStrictEqual(
      dotsStyle(
        [[2, ...run(4, 7), ...run(20, 8), 40, ...run(50, 1000)], run(0, 8)],
        look,
      ),
      {
        backgroundImage: [
          `linear-gradient(to right,${[0, ...run(2, 7), 38].map(dot).join(',')},transparent 0)`,
          pattern,
          pattern,
          pattern,
        ].join(','),
        backgroundPosition: [
          '16px var(--dot-top)',
          '160px var(--dot-top)',
          '400px var(--dot-top)',
          '0px calc(1 * var(--dot-row) + var(--dot-top))',
        ].join(','),
        backgroundSize: [
          '312px var(--space-dot)',
          '64px var(--space-dot)',
          '8000px var(--space-dot)',
          '64px var(--space-dot)',
        ].join(','),
      },
    );
  });
});
