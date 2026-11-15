import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type {
  GraphLine,
  GraphRow,
} from '../../../../../tools/git/shared/protocol';
import {
  graphWidth,
  rowLanes,
  withoutWorkingTreeLink,
} from '../../../../../tools/git/page/graphLanes';

const graphRow = (lane: number, ...lines: GraphLine[]): GraphRow => ({
  lane,
  color: 1,
  lines,
});

suite('Commit list without its working tree row', () => {
  test('draws no dashed line from the working tree down into the checked-out commit while the list has no working tree row, keeping the dashed lines of stashes below it', () => {
    const link = { from: 0, to: 0, color: 0, bottom: false, dashed: true };
    const own = { from: 1, to: 1, color: 1, bottom: true };
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, link, own), 0, 2),
      graphRow(1, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, { ...link, to: 1 }, own), 2, 2),
      graphRow(1, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(0, link, own), 3, 2),
      graphRow(0, link, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, link), 5, undefined),
      graphRow(1),
    );
  });
});

suite('Graph cell', () => {
  test('is as wide as the lanes its dot and lines reach, from one to twelve', () => {
    assert.strictEqual(rowLanes(undefined), 1);
    assert.strictEqual(
      rowLanes({
        lane: 0,
        color: 0,
        lines: [{ from: 0, to: 3, color: 0, bottom: true }],
      }),
      4,
    );
    assert.strictEqual(
      rowLanes({
        lane: 2,
        color: 0,
        lines: [{ from: 4, to: 2, color: 0, bottom: false }],
      }),
      5,
    );
    assert.strictEqual(graphWidth(0), 18);
    assert.strictEqual(graphWidth(3), 42);
    assert.strictEqual(graphWidth(20), 150);
  });
});
