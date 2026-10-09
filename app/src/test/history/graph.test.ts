import * as assert from 'node:assert';
import { graphOf } from './historyFixtures';
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
  const [row] = graphOf([
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
    const graph = graphOf([
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
    const graph = graphOf([
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
    const rows = graphOf([
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
    const graph = graphOf([
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
    const graph = graphOf([
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
    const graph = graphOf([
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
    const graph = graphOf([
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
    const full = graphOf(history, { checkpointEvery: 1000 }).rows(0, 50);
    const paged = graphOf(history, { checkpointEvery: 7 });
    assert.deepStrictEqual(paged.rows(0, 50), full);
    assert.deepStrictEqual(paged.rows(23, 10), full.slice(23, 33));
  });

  test('computes any page the same as a full walk through hundreds of lanes, merges, stashes and parents outside the history', () => {
    const count = 3000;
    const history = Array.from({ length: count }, (_, index) => {
      const later = (step: number) => `c${index + step}`;
      const parents =
        index % 97 === 0
          ? []
          : index % 3 === 0
            ? [later(1), later(5 + (index % 400))]
            : index % 7 === 0
              ? [later(2 + (index % 300)), later(1), later(9)]
              : [later(1 + (index % 4))];
      return { hash: `c${index}`, parents };
    });
    const options = {
      head: 'c4',
      stashes: new Set(['c10', 'c2001']),
      checkpointEvery: 64,
    };
    const full = graphOf(history, { ...options, checkpointEvery: count * 2 });
    const whole = full.rows(0, count);
    assert.ok(
      Math.max(...whole.map((row) => row.lines.length)) > 12,
      'the history reaches past the lanes drawn',
    );
    for (const start of [0, 1, 63, 64, 65, 500, 1234, 2950]) {
      assert.deepStrictEqual(
        graphOf(history, options).rows(start, 100),
        whole.slice(start, start + 100),
        `page at ${start}`,
      );
    }
    const paged = graphOf(history, options);
    for (const start of [2950, 10, 1500, 1501]) {
      assert.deepStrictEqual(
        paged.rows(start, 50),
        whole.slice(start, start + 50),
        `page at ${start} after others`,
      );
    }
    assert.deepStrictEqual(
      graphOf(history, options).workingTreeRow,
      full.workingTreeRow,
    );
  });

  test('walks ahead through the rest of the rows a slice at a time, letting other work run, until it is no longer shown', async () => {
    const count = 5000;
    let read = 0;
    const history = Array.from({ length: count }, (_, index) => ({
      hash: `c${index}`,
      get parents() {
        read++;
        return index < count - 1 ? [`c${index + 1}`] : [];
      },
    }));
    const replaced = graphOf(history, { checkpointEvery: 100 });
    await replaced.walkAhead(() => false, 0);
    assert.strictEqual(read, 0);

    const graph = graphOf(history, { checkpointEvery: 100 });
    let ran = false;
    setImmediate(() => {
      ran = true;
    });
    await graph.walkAhead(() => true, 0);
    assert.ok(ran);
    read = 0;
    assert.strictEqual(graph.rows(count - 10, 10).length, 10);
    assert.ok(read <= 100 + 10, `${read} rows walked for the last page`);
  });

  test('lays out no row past the page asked for', () => {
    assert.strictEqual(graphOf(laidOutBefore(100)).rows(0, 100).length, 100);
    const graph = graphOf(laidOutBefore(199));
    assert.strictEqual(graph.rows(0, 100).length, 100);
    assert.strictEqual(graph.rows(99, 100).length, 100);
  });

  test('draws lanes past the last one shown in it, once per color', () => {
    const tips = Array.from({ length: 40 }, (_, index) => ({
      hash: `t${index}`,
      parents: ['c'],
    }));
    const row = graphOf([...tips, { hash: 'c', parents: [] }]).rows(39, 1)[0];
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
    const row = graphOf([...tips, { hash: 'c', parents: [] }]).rows(19, 1)[0];
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
    const graph = graphOf(
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
    const graph = graphOf(
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
    const graph = graphOf(
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
    const graph = graphOf(
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
    const graph = graphOf([{ hash: 'a', parents: [] }], { head: 'x' });
    assert.strictEqual(describe(graph.workingTreeRow), '0: ');
    assert.deepStrictEqual(graph.rows(0, 1).map(describe), ['0: ']);
  });

  test('leads the working tree down past the first rows of a history still loading, to HEAD below them', () => {
    const whole = graphOf(
      [
        { hash: 'c', parents: ['b'] },
        { hash: 'h', parents: ['b'] },
        { hash: 'b', parents: [] },
      ],
      { head: 'h' },
    );
    const first = graphOf([{ hash: 'c', parents: ['b'] }], {
      head: 'h',
      partial: true,
    });
    assert.deepStrictEqual(first.workingTreeRow, whole.workingTreeRow);
    assert.deepStrictEqual(first.rows(0, 1), whole.rows(0, 1));
  });
});
