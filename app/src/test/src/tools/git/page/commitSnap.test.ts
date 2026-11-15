import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  commitEndPadding,
  snappedToCommit,
} from '../../../../../tools/git/page/commitSnap';

const starts = [0, 18, 54, 90, 144, 180];
const startOf = (index: number) => starts[index];
const count = starts.length;

suite('Commit snapping', () => {
  test('stops a scroll on the start of a commit, the next one going down and the one before going up, as the commits are two or three lines tall and the changes one', () => {
    assert.strictEqual(snappedToCommit(startOf, count, 60, 1, 1000), 90);
    assert.strictEqual(snappedToCommit(startOf, count, 60, -1, 1000), 54);
    assert.strictEqual(snappedToCommit(startOf, count, 60, 0, 1000), 90);
    assert.strictEqual(snappedToCommit(startOf, count, 54.004, 0, 1000), 54);
    assert.strictEqual(snappedToCommit(startOf, count, 0, -1, 1000), 0);
    assert.strictEqual(snappedToCommit(startOf, count, 500, 1, 1000), 180);
  });

  test('never stops past the end of the list', () => {
    assert.strictEqual(snappedToCommit(startOf, count, 170, 1, 150), 150);
    assert.strictEqual(snappedToCommit(startOf, count, -20, 0, 150), 0);
  });

  test('pads the end of the list by as much as its last place falls short of the start of a commit, so the commit at the top is whole there too', () => {
    assert.strictEqual(commitEndPadding(startOf, count, 216, 100), 28);
    assert.strictEqual(commitEndPadding(startOf, count, 190, 100), 0);
    assert.strictEqual(commitEndPadding(startOf, count, 80, 100), 0);
  });
});
