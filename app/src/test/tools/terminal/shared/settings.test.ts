import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  contrastRatio,
  scrollbackLines,
} from '../../../../tools/terminal/shared/settings';

suite('Terminal settings', () => {
  test('keeps from none to 100,000 whole lines of scrollback, as each line is kept twice, by the page and by the copy of the screen', () => {
    assert.deepStrictEqual(
      [10_000, 0, -5, 2.6, 1e9, Number.NaN].map(scrollbackLines),
      [10_000, 0, 0, 3, 100_000, 0],
    );
  });

  test('asks text for a contrast from 1, as it was painted, to 21, black on white', () => {
    assert.deepStrictEqual(
      [4.5, 7, 1, 0, -2, 30, Number.NaN].map(contrastRatio),
      [4.5, 7, 1, 1, 1, 21, 1],
    );
  });
});
