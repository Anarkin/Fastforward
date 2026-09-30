import * as assert from 'node:assert';
import { Graph } from '../history/graph';
import type { GraphRow } from '../shared/protocol';

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

function colors(row: GraphRow): string[] {
  return row.lines
    .map((line) => `${line.from}>${line.to}:${line.color}`)
    .toSorted();
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

  test("keeps each lane's color, and draws a branch joining at the fork in its own color", () => {
    const rows = new Graph([
      { hash: 'm', parents: ['a', 'b'] },
      { hash: 'a', parents: ['c'] },
      { hash: 'b', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]).rows(0, 4);
    assert.deepStrictEqual(
      rows.map((row) => row.color),
      [1, 1, 2, 1],
    );
    assert.deepStrictEqual(colors(rows[0]), ['0>0:1', '0>1:2']);
    assert.deepStrictEqual(colors(rows[3]), ['0>0:1', '1>0:2']);
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

  test('joins a merge to the lane already waiting for its parent', () => {
    const graph = new Graph([
      { hash: 'm', parents: ['a', 'b'] },
      { hash: 'n', parents: ['a', 'b'] },
      { hash: 'a', parents: ['c'] },
      { hash: 'b', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]);
    assert.strictEqual(graph.width, 3);
    assert.deepStrictEqual(graph.rows(0, 5).map(describe), [
      '0: 0>0. 0>1.',
      '2: 0>0 0>0. 1>1 1>1. 2>1. 2>2.',
      '0: 0>0 0>0. 1>1 1>1. 2>0',
      '1: 0>0 0>0. 1>1 1>1.',
      '0: 0>0 1>0',
    ]);
  });

  test('draws an octopus merge to a lane per parent', () => {
    const graph = new Graph([
      { hash: 'o', parents: ['a', 'b', 'c'] },
      { hash: 'a', parents: ['d'] },
      { hash: 'b', parents: ['d'] },
      { hash: 'c', parents: ['d'] },
      { hash: 'd', parents: [] },
    ]);
    assert.strictEqual(graph.width, 3);
    assert.strictEqual(describe(graph.rows(0, 1)[0]), '0: 0>0. 0>1. 0>2.');
  });

  test('answers a page past the end with no rows', () => {
    const graph = new Graph([
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
    assert.deepStrictEqual(graph.rows(3, 10), []);
    assert.strictEqual(graph.rows(2, 10).length, 1);
  });

  test('computes any page the same as a full walk', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      hash: `c${index}`,
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
