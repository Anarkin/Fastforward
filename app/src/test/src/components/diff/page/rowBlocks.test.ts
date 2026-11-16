import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  blocksNear,
  blocksOf,
  drawnRuns,
  rowBlocks,
} from '../../../../../components/diff/page/rowBlocks';

suite('Drawing code', () => {
  test('joins the blocks of rows drawn next to each other into one run of text, a block away from them a run of its own, so the browser wraps each run as it wraps the whole line, a row breaking only where a run starts', () => {
    const starts = Array.from({ length: 200 }, (_, row) => row * 10);
    const blocks = rowBlocks(starts, 2005);
    assert.deepStrictEqual(blocks, [
      { from: 0, to: 640, row: 0, rows: 64 },
      { from: 640, to: 1280, row: 64, rows: 64 },
      { from: 1280, to: 1920, row: 128, rows: 64 },
      { from: 1920, to: 2005, row: 192, rows: 8 },
    ]);
    assert.deepStrictEqual(drawnRuns(blocks, new Set([2, 1])), [
      { from: 640, to: 1920, row: 64, rows: 128 },
    ]);
    assert.deepStrictEqual(drawnRuns(blocks, new Set([3, 0])), [
      { from: 0, to: 640, row: 0, rows: 64 },
      { from: 1920, to: 2005, row: 192, rows: 8 },
    ]);
    assert.deepStrictEqual(drawnRuns(blocks, new Set()), []);
  });

  test('finds the blocks of a line with rows between two heights, to draw the rows near those in sight before the frame that shows them', () => {
    const blocks = rowBlocks(
      Array.from({ length: 200 }, (_, row) => row * 10),
      2000,
    );
    assert.deepStrictEqual([...blocksNear(blocks, 10, 650, 1300)], [1, 2]);
    assert.deepStrictEqual([...blocksNear(blocks, 10, -500, 0)], []);
    assert.deepStrictEqual([...blocksNear(blocks, 10, -500, 1)], [0]);
    assert.deepStrictEqual([...blocksNear(blocks, 10, 1920, 5000)], [3]);
    assert.deepStrictEqual([...blocksNear(blocks, 10, 2000, 5000)], []);
  });

  test('draws every block of rows the current match spans, so a match found far from the rows in sight is drawn to scroll it into view', () => {
    const blocks = rowBlocks(
      Array.from({ length: 200 }, (_, row) => row * 10),
      2000,
    );
    assert.deepStrictEqual(blocksOf(blocks, { start: 630, end: 650 }), [0, 1]);
    assert.deepStrictEqual(blocksOf(blocks, { start: 640, end: 640 }), [1]);
    assert.deepStrictEqual(blocksOf(blocks, { start: 1990, end: 2000 }), [3]);
    assert.deepStrictEqual(blocksOf(blocks, undefined), []);
  });
});
