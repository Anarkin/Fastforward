import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchMarks, minimapMarks } from '../../../../lib/page/minimapMarks';
import { Minimap } from '../../../../lib/page/minimap';
import type { DiffRow } from '../../../../lib/page/diffRows';
import {
  uniformHeight as row,
  minimapRows,
} from '../../../../lib/page/rowMeasures';

const line = (kind: 'added' | 'removed' | 'context'): DiffRow => ({
  kind: 'line',
  file: 0,
  line: { kind, text: '', oldNumber: undefined, newNumber: undefined },
});

function minimap(viewport: number, pinned = false): string {
  const scroller = {
    scrollTop: 100,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  return renderToStaticMarkup(
    <Minimap
      marks={[{ kind: 'added', top: 0.25, height: 0.5 }]}
      scroller={{ current: scroller }}
      viewport={viewport}
      total={400}
      pinned={pinned}
      onScroll={() => {}}
    />,
  );
}

suite('Minimap', () => {
  test('marks a diff shorter than the view where its rows are, not stretched over the whole minimap', () => {
    assert.match(
      minimap(800),
      /class="minimap-mark added" style="top:12.5%;height:25%"/,
    );
    assert.match(
      minimap(200),
      /class="minimap-mark added" style="top:25%;height:50%"/,
    );
  });

  test('marks each run of added or removed lines where it is in the file', () => {
    const rows = minimapRows([
      { kind: 'file', file: 0, path: 'a', open: true, collapsible: true },
      line('context'),
      line('removed'),
      line('added'),
      line('added'),
      line('context'),
      line('context'),
      line('added'),
    ]);
    assert.deepStrictEqual(minimapMarks(rows), [
      { kind: 'removed', top: (2 * row) / (8 * row), height: row / (8 * row) },
      {
        kind: 'added',
        top: (3 * row) / (8 * row),
        height: (2 * row) / (8 * row),
      },
      { kind: 'added', top: (7 * row) / (8 * row), height: row / (8 * row) },
    ]);
  });

  test('counts the measured height of rows like an error above the file', () => {
    const rows = minimapRows(
      [
        { kind: 'error' },
        { kind: 'file', file: 0, path: 'a', open: true, collapsible: true },
        line('added'),
      ],
      (index) => (index === 0 ? 40 : undefined),
    );
    assert.deepStrictEqual(minimapMarks(rows), [
      {
        kind: 'added',
        top: (40 + row) / (40 + 2 * row),
        height: row / (40 + 2 * row),
      },
    ]);
  });

  test('counts the measured height of a wrapped line over the height of one row', () => {
    const rows = minimapRows([line('context'), line('added')], (index) =>
      index === 0 ? 66 : 22,
    );
    assert.deepStrictEqual(minimapMarks(rows), [
      { kind: 'added', top: 66 / 88, height: 22 / 88 },
    ]);
  });

  test('marks nothing in an empty or unchanged file', () => {
    assert.deepStrictEqual(minimapMarks([]), []);
    assert.deepStrictEqual(
      minimapMarks(minimapRows([line('context'), line('context')])),
      [],
    );
  });

  test('draws the marks where they are, and the part in view only when not all of it is', () => {
    const html = minimap(200);
    assert.match(html, /class="minimap-mark added" style="top:25%;height:50%"/);
    assert.match(html, /class="minimap-viewport" style="top:25%;height:50%"/);
    assert.doesNotMatch(minimap(400), /minimap-viewport/);
  });

  test('shows the part in view while pinned, as while finding, so jumping from match to match shows where in the diff it is, and hides it otherwise until scrolled or pointed at', () => {
    assert.match(minimap(200, true), /class="diff-minimap shown/);
    assert.doesNotMatch(minimap(200), /shown/);
  });

  test('ticks the minimap where the matched rows are, once for each run of them', () => {
    const rows = [
      { height: 10, change: undefined },
      { height: 30, change: undefined },
      { height: 40, change: 'added' as const },
      { height: 10, change: undefined },
      { height: 10, change: undefined },
    ];
    assert.deepStrictEqual(matchMarks(rows, new Set([0, 2, 3])), [
      { kind: 'match', top: 0, height: 0.1 },
      { kind: 'match', top: 0.4, height: 0.5 },
    ]);
    assert.deepStrictEqual(matchMarks([], new Set([0])), []);
  });
});
