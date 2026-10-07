import * as assert from 'node:assert';
import { Graph } from '../history/graph';
import { renderToStaticMarkup } from 'react-dom/server';
import { graphColors, maxLanes, type GraphRow } from '../shared/protocol';
import { GraphCell, graphWidth, rowLanes } from '../webview/graph';
import { noop } from './fixtures';

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

  test('leaves the working tree alone when HEAD is not shown', () => {
    const graph = new Graph([{ hash: 'a', parents: [] }], { head: 'x' });
    assert.strictEqual(describe(graph.workingTreeRow), '0: ');
    assert.deepStrictEqual(graph.rows(0, 1).map(describe), ['0: ']);
  });
});

const cell = (row: GraphRow, height = 30) =>
  renderToStaticMarkup(
    <GraphCell row={row} height={height} onToggleMerge={noop} />,
  );

const attributes = (html: string, tag: string, name: string) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]* ${name}="([^"]*)"`, 'g'))].map(
    (match) => match[1],
  );

const titles = (html: string) =>
  [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]);

suite('Graph cell', () => {
  test('draws lines to the foot of the row, curving between lanes, dashed where asked', () => {
    const html = cell(
      {
        lane: 0,
        color: 0,
        lines: [
          { from: 0, to: 0, color: 0, bottom: false },
          { from: 0, to: 1, color: 1, bottom: false, dashed: true },
          { from: 0, to: 0, color: 0, bottom: true },
          { from: 0, to: 1, color: 1, bottom: true },
        ],
      },
      50,
    );
    assert.deepStrictEqual(attributes(html, 'path', 'd'), [
      'M 9 0 V 15',
      'M 9 0 C 9 7.5 21 7.5 21 15',
      'M 9 15 V 50',
      'M 9 15 C 9 25 21 25 21 35 V 50',
    ]);
    assert.deepStrictEqual(
      [...html.matchAll(/<path[^>]*>/g)].map((match) =>
        match[0].includes('stroke-dasharray="2 3"'),
      ),
      [false, true, false, false],
    );
  });

  test('keeps a dashed and a solid copy of the same line apart', () => {
    const line = { from: 0, to: 0, color: 0, bottom: true };
    const html = cell({
      lane: 0,
      color: 0,
      lines: [line, { ...line, dashed: true }],
    });
    assert.strictEqual(attributes(html, 'path', 'd').length, 2);
  });

  test('folds lanes past the widest graph onto its last lane, and cycles colors', () => {
    const html = cell({
      lane: 15,
      color: 8,
      lines: [{ from: 15, to: 20, color: 9, bottom: true }],
    });
    assert.deepStrictEqual(attributes(html, 'svg', 'width'), ['150']);
    assert.deepStrictEqual(attributes(html, 'circle', 'cx'), ['141']);
    assert.deepStrictEqual(attributes(html, 'circle', 'fill'), [
      'var(--color-chart-blue)',
    ]);
    assert.deepStrictEqual(attributes(html, 'path', 'd'), ['M 141 15 V 30']);
    assert.deepStrictEqual(attributes(html, 'path', 'stroke'), [
      'var(--color-chart-green)',
    ]);
  });

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

  test('draws a merge as a ring sized and titled by what it hides, the working tree and stashes as a square', () => {
    const merge = (hidden: number | undefined) =>
      cell({ lane: 0, color: 0, lines: [], merge: 'collapsed', hidden });
    for (const [hidden, title, radius] of [
      [undefined, 'Expand merge', '3.5'],
      [0, 'Expand merge', '3.5'],
      [1, '1 commit merged, click to expand', '3.5'],
      [2, '2 commits merged, click to expand', '4.5'],
      [7, '7 commits merged, click to expand', '5'],
      [12, '12 commits merged, click to expand', '5.5'],
      [60, '60 commits merged, click to expand', '6'],
    ] as const) {
      const html = merge(hidden);
      assert.deepStrictEqual(titles(html), [title]);
      assert.deepStrictEqual(attributes(html, 'circle', 'r'), ['8', radius]);
    }

    const expanded = cell({ lane: 0, color: 0, lines: [], merge: 'expanded' });
    assert.deepStrictEqual(titles(expanded), ['Collapse merge']);
    assert.deepStrictEqual(attributes(expanded, 'circle', 'r'), [
      '8',
      '4',
      '1.5',
    ]);

    const workingTree = cell({
      lane: 0,
      color: 0,
      lines: [],
      workingTree: true,
    });
    assert.match(workingTree, /<rect/);
    assert.doesNotMatch(workingTree, /<circle|merge-dot/);

    const stash = cell({ lane: 0, color: 0, lines: [], stash: true });
    assert.match(stash, /<rect/);
    assert.doesNotMatch(stash, /<circle|merge-dot/);

    const plain = cell({ lane: 0, color: 0, lines: [] });
    assert.deepStrictEqual(attributes(plain, 'circle', 'r'), ['4']);
    assert.doesNotMatch(plain, /merge-dot|<rect/);
  });
});
