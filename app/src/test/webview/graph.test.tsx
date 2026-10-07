import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphRow } from '../../shared/protocol';
import { GraphCell, graphWidth, rowLanes } from '../../webview/graph';
import { noop } from '../fixtures';

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
