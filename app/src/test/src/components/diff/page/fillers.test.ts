import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fillerRuns } from '../../../../../components/diff/page/fillers';
import type { DiffRow } from '../../../../../components/diff/page/rows';

const line = (text: string) => ({
  line: { kind: 'context' as const, text, oldNumber: 1, newNumber: 1 },
  index: 0,
});

const both: DiffRow = {
  kind: 'split',
  file: 0,
  left: line('a'),
  right: line('a'),
};

const leftOnly: DiffRow = { ...both, right: undefined };

const rightOnly: DiffRow = { ...both, left: undefined };

const placed = (heights: readonly number[], from = 0) => {
  let start = 100;
  return heights.map((size, at) => {
    const item = { index: from + at, start, size };
    start += size;
    return item;
  });
};

suite('Sides of a diff with no line', () => {
  test('hatches the side that has no line of a row, the rows after one another that lack the same side as one stretch, so a file added whole hatches its other side with one element', () => {
    const rows = [both, leftOnly, leftOnly, rightOnly, both, rightOnly];

    assert.deepStrictEqual(fillerRuns(rows, placed([18, 18, 36, 18, 18, 18])), [
      { side: 1, top: 118, height: 54 },
      { side: 0, top: 172, height: 18 },
      { side: 0, top: 208, height: 18 },
    ]);
  });

  test('hatches nothing beside the rows that are no code or have both their lines, and starts a stretch anew after a row not drawn between', () => {
    const header: DiffRow = {
      kind: 'file',
      file: 0,
      path: 'a',
      open: true,
      collapsible: false,
    };
    const rows = [header, leftOnly, both, leftOnly, leftOnly];
    const [first, , , fourth, fifth] = placed([18, 18, 18, 18, 18]);

    assert.deepStrictEqual(fillerRuns(rows, placed([18, 18, 18])), [
      { side: 1, top: 118, height: 18 },
    ]);
    assert.ok(first && fourth && fifth);
    assert.deepStrictEqual(
      fillerRuns(
        [leftOnly, both, both, leftOnly, leftOnly],
        [first, fourth, fifth],
      ),
      [
        { side: 1, top: 100, height: 18 },
        { side: 1, top: 154, height: 36 },
      ],
    );
  });
});
