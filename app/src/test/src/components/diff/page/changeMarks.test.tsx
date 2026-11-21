import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  matchMarks,
  changedMarks,
  leastMark,
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
      /class="scrollbar-mark added" style="--mark-top:12.5%;--mark-height:25%"/,
    );
    assert.match(
      marked(200),
      /class="scrollbar-mark added" style="--mark-top:25%;--mark-height:50%"/,
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
    assert.deepStrictEqual(changedMarks(rows, 0), [
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
    assert.deepStrictEqual(changedMarks(rows, 0), [
      {
        kind: 'added',
        top: (40 + row) / (40 + 2 * row),
        height: 1 - (40 + row) / (40 + 2 * row),
      },
    ]);
  });

  test('counts the measured height of a wrapped line over the height of one row', () => {
    const rows = markedRows([line('context'), line('added')], (index) =>
      index === 0 ? 66 : 22,
    );
    assert.deepStrictEqual(changedMarks(rows, 0), [
      { kind: 'added', top: 66 / 88, height: 22 / 88 },
    ]);
  });

  test('marks nothing in an empty or unchanged file', () => {
    assert.deepStrictEqual(changedMarks([], 0), []);
    assert.deepStrictEqual(
      changedMarks(markedRows([line('context'), line('context')]), 0),
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
    assert.deepStrictEqual(matchMarks(rows, new Set([0, 2, 3]), 0), [
      { kind: 'match', top: 0, height: 0.1 },
      { kind: 'match', top: 0.4, height: 0.5 },
    ]);
    assert.deepStrictEqual(matchMarks([], new Set([0]), 0), []);
  });

  test('marks runs of one kind too close to tell apart once, the removed and the added each by themselves and at least the least mark tall, top to bottom, so a commit of thousands of hunks marks its track once every few pixels at most rather than once a hunk', () => {
    const kinds = ['added', undefined, 'removed', undefined] as const;
    const rows = Array.from({ length: 4000 }, (_, index) => ({
      height: 20,
      change: kinds[index % 4],
    }));
    const least = leastMark(4000 * 20, 800);
    const apart = changedMarks(rows, 0);
    const joined = changedMarks(rows, least);
    assert.deepStrictEqual(
      [apart.length, least, joined.map(({ kind }) => kind)],
      [2000, 2 / 800, ['added', 'removed']],
    );
    assert.deepStrictEqual(
      joined.map(({ top }) => top),
      [0, 2 / 4000],
    );
    assert.ok(
      joined.every(({ top, height }) => top + height > 0.999),
      JSON.stringify(joined),
    );
    const sparse = changedMarks(
      [
        { height: 20, change: 'added' },
        { height: 4000, change: undefined },
        { height: 20, change: 'added' },
        { height: 3960, change: undefined },
      ],
      leastMark(8000, 800),
    );
    assert.deepStrictEqual(sparse, [
      { kind: 'added', top: 0, height: 20 / 8000 },
      { kind: 'added', top: 4020 / 8000, height: 4040 / 8000 - 4020 / 8000 },
    ]);
    assert.deepStrictEqual(
      matchMarks(rows, new Set(rows.map((_, index) => index * 2)), least).map(
        ({ kind }) => kind,
      ),
      ['match'],
    );
  });

  test('takes two pixels of the track for the least mark, of the track a diff shorter than its view marks only a part of, and none before either is measured', () => {
    assert.deepStrictEqual(
      [
        leastMark(4000, 800),
        leastMark(400, 800),
        leastMark(0, 800),
        leastMark(4000, 0),
      ],
      [2 / 800, 2 / 400, 0, 0],
    );
  });
});
