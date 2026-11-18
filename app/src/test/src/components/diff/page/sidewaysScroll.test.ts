import * as assert from 'node:assert';
import { sidewaysColumns } from '../../../../../lib/page/scrollSettings';
import { suite, test } from 'vitest';
import {
  codeShift,
  diffScrollLeft,
} from '../../../../../components/diff/page/sidewaysScroll';

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, as many columns of the text a press as the viewer does, onto a whole column though it started between two, leaving it to move between the columns only then', () => {
    assert.strictEqual(
      diffScrollLeft(-1, 700, 1000, 7),
      700 - sidewaysColumns * 7,
    );
    assert.strictEqual(
      diffScrollLeft(-1, 703, 1000, 7),
      700 - sidewaysColumns * 7,
    );
    assert.strictEqual(diffScrollLeft(-1, 20, 1000, 7), 0);
    assert.strictEqual(diffScrollLeft(-1, 0, 1000, 7), undefined);
  });

  test('scrolls a diff right with the right arrow too, onto whole columns, no further than its widest line, whose end it stops at though that falls between columns', () => {
    assert.strictEqual(diffScrollLeft(1, 0, 1000, 7), sidewaysColumns * 7);
    assert.strictEqual(diffScrollLeft(1, 990, 1000, 7), 1000);
    assert.strictEqual(diffScrollLeft(1, 1000, 1000, 7), undefined);
    assert.strictEqual(diffScrollLeft(1, 0, 0, 7), undefined);
  });
});

suite('Diff code moved sideways', () => {
  test('moves the code of a line by a transform set on the code itself, on whole device pixels, by none at rest yet set then too, as the first step from rest painted every line anew for 27 ms once the transform came and went, and as a rule moving the code of every line cost the browser 3.4 ms a step to work the styles of the lines out again, set on each 0.9', () => {
    assert.deepStrictEqual(
      [
        codeShift(0, 1.25),
        codeShift(72, 1.25),
        codeShift(40, 1),
        codeShift(40.3, 1.25),
      ],
      [
        'translateX(0px)',
        'translateX(-72px)',
        'translateX(-40px)',
        'translateX(-40px)',
      ],
    );
  });
});
