import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  matchMarks,
  changedMarks,
  marksScale,
} from '../../../../../components/diff/page/changeMarks';
import { ScrollbarMarks } from '../../../../../lib/page/scrollbarMarks';
import type { DiffRow } from '../../../../../components/diff/page/rows';
import {
  uniformHeight as row,
  markedRows,
} from '../../../../../components/diff/page/rowMeasures';

const line = (kind: 'added' | 'removed' | 'context'): DiffRow => ({
  kind: 'line',
  file: 0,
  line: { kind, text: '', oldNumber: undefined, newNumber: undefined },
});

function marked(viewport: number): string {
  return renderToStaticMarkup(
    <ScrollbarMarks
      marks={[{ kind: 'added', top: 0.25, height: 0.5 }]}
      scale={marksScale(400, viewport)}
    />,
  );
}

suite('Marks of a diff on its scrollbar', () => {
  test('marks a diff shorter than the view where its rows are, not stretched over the whole track', () => {
    assert.match(
      marked(800),
      /class="scrollbar-mark added" style="top:12.5%;height:25%"/,
    );
    assert.match(
      marked(200),
      /class="scrollbar-mark added" style="top:25%;height:50%"/,
    );
  });

  test('marks each run of added or removed lines where it is in the file', () => {
    const rows = markedRows([
      { kind: 'file', file: 0, path: 'a', open: true, collapsible: true },
      line('context'),
      line('removed'),
      line('added'),
      line('added'),
      line('context'),
      line('context'),
      line('added'),
    ]);
    assert.deepStrictEqual(changedMarks(rows), [
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
    const rows = markedRows(
      [
        { kind: 'error' },
        { kind: 'file', file: 0, path: 'a', open: true, collapsible: true },
        line('added'),
      ],
      (index) => (index === 0 ? 40 : undefined),
    );
    assert.deepStrictEqual(changedMarks(rows), [
      {
        kind: 'added',
        top: (40 + row) / (40 + 2 * row),
        height: row / (40 + 2 * row),
      },
    ]);
  });

  test('counts the measured height of a wrapped line over the height of one row', () => {
    const rows = markedRows([line('context'), line('added')], (index) =>
      index === 0 ? 66 : 22,
    );
    assert.deepStrictEqual(changedMarks(rows), [
      { kind: 'added', top: 66 / 88, height: 22 / 88 },
    ]);
  });

  test('marks nothing in an empty or unchanged file', () => {
    assert.deepStrictEqual(changedMarks([]), []);
    assert.deepStrictEqual(
      changedMarks(markedRows([line('context'), line('context')])),
      [],
    );
  });

  test('ticks the track where the matched rows are, once for each run of them', () => {
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
