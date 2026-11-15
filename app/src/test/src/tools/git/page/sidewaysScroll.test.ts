import * as assert from 'node:assert';
import { sidewaysColumns } from '../../../../../lib/page/scrollSettings';
import { suite, test } from 'vitest';
import { diffScrollLeft } from '../../../../../tools/git/page/sidewaysScroll';

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, as many columns of the text a press as the viewer does, leaving it to move between the columns only then', () => {
    assert.strictEqual(
      diffScrollLeft(-1, 100, undefined, 7),
      100 - sidewaysColumns * 7,
    );
    assert.strictEqual(diffScrollLeft(-1, 20, undefined, 7), 0);
    assert.strictEqual(diffScrollLeft(-1, 0, undefined, 7), undefined);
    assert.strictEqual(diffScrollLeft(1, 100, undefined, 7), undefined);
  });

  test('scrolls the sides of a side by side diff right with the right arrow too, no further than the widest line, as nothing else scrolls them', () => {
    assert.strictEqual(diffScrollLeft(1, 0, 100, 7), sidewaysColumns * 7);
    assert.strictEqual(diffScrollLeft(1, 80, 100, 7), 100);
    assert.strictEqual(diffScrollLeft(1, 100, 100, 7), undefined);
    assert.strictEqual(diffScrollLeft(1, 0, 0, 7), undefined);
    assert.strictEqual(
      diffScrollLeft(-1, 100, 100, 7),
      100 - sidewaysColumns * 7,
    );
  });
});
