import * as assert from 'node:assert';
import { Graph } from '../../history/graph';
import { graphColors, maxLanes, type GraphRow } from '../../shared/protocol';

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

function widthOf(rows: readonly GraphRow[]): number {
  return Math.max(
    ...rows.map((row) =>
      Math.max(
        row.lane + 1,
        ...row.lines.map((line) => Math.max(line.from, line.to) + 1),
      ),
    ),
  );
}

function colors(row: GraphRow): string[] {
  return row.lines
    .map((line) => `${line.from}>${line.to}:${line.color}`)
    .toSorted();
}

function lanesReached(tips: number): number {
  const [row] = new Graph([
    ...Array.from({ length: tips }, (_, index) => ({
      hash: `t${index}`,
      parents: ['c'],
    })),
    { hash: 'c', parents: [] },
  ]).rows(tips - 1, 1);
  return Math.max(...row.lines.map((line) => Math.max(line.from, line.to) + 1));
}

const laidOutBefore = (end: number) =>
  Array.from({ length: 1000 }, (_, index) =>
    index < end
      ? { hash: `c${index}`, parents: [`c${index + 1}`] }
      : {
          hash: `c${index}`,
          get parents(): string[] {
            throw new Error(`laid out c${index}`);
          },
        },
  );

suite('Graph', () => {
  test('keeps a straight history in one lane', () => {
    const graph = new Graph([
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
    assert.strictEqual(widthOf(graph.rows(0, 3)), 1);
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
    assert.strictEqual(widthOf(graph.rows(0, 4)), 2);
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
    assert.strictEqual(widthOf(graph.rows(0, 5)), 3);
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
    assert.strictEqual(widthOf(graph.rows(0, 5)), 3);
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
    assert.deepStrictEqual(paged.rows(23, 10), full.slice(23, 33));
  });

  test('lays out no row past the page asked for', () => {
    assert.strictEqual(new Graph(laidOutBefore(100)).rows(0, 100).length, 100);
    const graph = new Graph(laidOutBefore(199));
    assert.strictEqual(graph.rows(0, 100).length, 100);
    assert.strictEqual(graph.rows(99, 100).length, 100);
  });

  test('draws lanes past the last one shown in it, once per color', () => {
    const tips = Array.from({ length: 40 }, (_, index) => ({
      hash: `t${index}`,
      parents: ['c'],
    }));
    const row = new Graph([...tips, { hash: 'c', parents: [] }]).rows(39, 1)[0];
    assert.strictEqual(row.lane, 39);
    assert.ok(
      row.lines.every((line) => line.from < maxLanes && line.to < maxLanes),
    );
    const drawn = (bottom: boolean) =>
      row.lines
        .filter((line) => line.bottom === bottom)
        .map((line) => `${line.from}>${line.to}:${line.color % graphColors}`);
    const lanes = Array.from({ length: maxLanes - 1 }, (_, lane) => lane);
    const past = Array.from(
      { length: graphColors },
      (_, color) => `${maxLanes - 1}>${maxLanes - 1}:${color}`,
    );
    for (const bottom of [false, true]) {
      assert.deepStrictEqual(
        drawn(bottom).toSorted(),
        [
          ...lanes.map((lane) => `${lane}>${lane}:${(lane + 1) % graphColors}`),
          ...past,
        ].toSorted(),
      );
    }
  });

  test('draws a line folded onto the last lane over the ones folded before it, once per color', () => {
    const tips = Array.from({ length: 20 }, (_, index) => ({
      hash: `t${index}`,
      parents: ['c'],
    }));
    const row = new Graph([...tips, { hash: 'c', parents: [] }]).rows(19, 1)[0];
    const folded = row.lines.filter(
      (line) => line.bottom && line.from === maxLanes - 1,
    );
    assert.deepStrictEqual(
      folded.map((line) => line.color),
      [13, 14, 15, 16, 17, 18, 19, 20],
    );
  });

  test('draws twelve lanes at most, folding a thirteenth onto the last', () => {
    assert.strictEqual(lanesReached(12), 12);
    assert.strictEqual(lanesReached(13), 12);
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

  test('draws a stash like the working tree, dashed down to its base', () => {
    const graph = new Graph(
      [
        { hash: 's', parents: ['b'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      { stashes: new Set(['s']) },
    );
    const rows = graph.rows(0, 3);
    assert.deepStrictEqual(rows.map(describe), [
      '0: 0>0.~',
      '0: 0>0. 0>0~',
      '0: 0>0',
    ]);
    assert.deepStrictEqual(
      rows.map((row) => row.stash ?? false),
      [true, false, false],
    );
  });

  test('keeps a merge of HEAD out of the dashed line leading the working tree to it', () => {
    const graph = new Graph(
      [
        { hash: 'm', parents: ['p', 'h'] },
        { hash: 'h', parents: ['b'] },
        { hash: 'p', parents: ['b'] },
        { hash: 'b', parents: [] },
      ],
      { head: 'h' },
    );
    assert.deepStrictEqual(graph.rows(0, 2).map(describe), [
      '1: 0>0.~ 0>0~ 1>1. 1>2.',
      '0: 0>0. 0>0~ 1>1 1>1. 2>0',
    ]);
  });

  test('keeps a merge of a stash base out of the dashed line leading the stash to it', () => {
    const graph = new Graph(
      [
        { hash: 's', parents: ['b'] },
        { hash: 'm', parents: ['a', 'b'] },
        { hash: 'a', parents: ['b'] },
        { hash: 'b', parents: [] },
      ],
      { stashes: new Set(['s']) },
    );
    assert.deepStrictEqual(graph.rows(0, 4).map(describe), [
      '0: 0>0.~',
      '1: 0>0.~ 0>0~ 1>1. 1>2.',
      '1: 0>0.~ 0>0~ 1>1 1>1. 2>2 2>2.',
      '0: 0>0~ 1>0 2>0',
    ]);
  });

  test('leaves the working tree alone when HEAD is not shown', () => {
    const graph = new Graph([{ hash: 'a', parents: [] }], { head: 'x' });
    assert.strictEqual(describe(graph.workingTreeRow), '0: ');
    assert.deepStrictEqual(graph.rows(0, 1).map(describe), ['0: ']);
  });
});
