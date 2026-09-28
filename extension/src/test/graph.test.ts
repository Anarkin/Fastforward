import * as assert from 'node:assert';
import { Graph } from '../history/graph';
import type { GraphRow } from '../shared/protocol';

// "from>to" for top lines and "from>to." for bottom lines, with a ~ when
// dotted, sorted
function describe(row: GraphRow): string {
  const lines = row.lines
    .map(
      (line) =>
        `${line.from}>${line.to}${line.bottom ? '.' : ''}${line.dashed ? '~' : ''}`,
    )
    .toSorted()
    .join(' ');
  return `${row.lane}: ${lines}`;
}

suite('Graph', () => {
  test('keeps a straight history in one lane', () => {
    const graph = new Graph([
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
    assert.strictEqual(graph.width, 1);
    assert.deepStrictEqual(graph.rows(0, 3).map(describe), [
      '0: 0>0.',
      '0: 0>0 0>0.',
      '0: 0>0',
    ]);
  });

  test('opens a lane for a merged branch and joins it at the fork', () => {
    // m merges b into a; both a and b branched off from c
    const graph = new Graph([
      { hash: 'm', parents: ['a', 'b'] },
      { hash: 'a', parents: ['c'] },
      { hash: 'b', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]);
    assert.strictEqual(graph.width, 2);
    assert.deepStrictEqual(graph.rows(0, 4).map(describe), [
      '0: 0>0. 0>1.',
      '0: 0>0 0>0. 1>1 1>1.',
      '1: 0>0 0>0. 1>1 1>1.',
      '0: 0>0 1>0',
    ]);
  });

  test('starts a lane for a branch tip nothing is waiting for', () => {
    const graph = new Graph([
      { hash: 'a', parents: ['c'] },
      { hash: 'b', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]);
    assert.deepStrictEqual(graph.rows(0, 3).map(describe), [
      '0: 0>0.',
      '1: 0>0 0>0. 1>1.',
      '0: 0>0 1>0',
    ]);
  });

  test('computes any page the same as a full walk', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      hash: `c${index}`,
      // Every fifth commit merges one a few rows further down
      parents:
        index === 49
          ? []
          : index % 5 === 0 && index + 3 < 49
            ? [`c${index + 1}`, `c${index + 3}`]
            : [`c${index + 1}`],
    }));
    const full = new Graph(history, { checkpointEvery: 1000 }).rows(0, 50);
    const paged = new Graph(history, { checkpointEvery: 7 });
    assert.deepStrictEqual(paged.rows(0, 50), full);
    // As wide as the widest row, found without drawing the rows' lines
    const widest = Math.max(
      ...full.map((row) =>
        Math.max(row.lane + 1, ...row.lines.map((line) => line.to + 1)),
      ),
    );
    assert.strictEqual(paged.width, widest);
    assert.deepStrictEqual(paged.rows(23, 10), full.slice(23, 33));
  });

  test('leads the working tree to HEAD, moving what is built on it aside', () => {
    const graph = new Graph(
      [
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      { head: 'a' },
    );
    assert.strictEqual(describe(graph.workingTreeRow), '0: 0>0.~');
    assert.deepStrictEqual(graph.rows(0, 2).map(describe), [
      '1: 0>0.~ 0>0~ 1>1.',
      '0: 0>0~ 1>0',
    ]);
  });

  test('leaves the working tree alone when HEAD is not shown', () => {
    const graph = new Graph([{ hash: 'a', parents: [] }], { head: 'x' });
    assert.strictEqual(describe(graph.workingTreeRow), '0: ');
    assert.deepStrictEqual(graph.rows(0, 1).map(describe), ['0: ']);
  });
});
