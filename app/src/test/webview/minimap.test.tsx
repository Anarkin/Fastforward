import * as assert from 'node:assert';
import {
  minimapRows,
  uniformHeight as row,
  type DiffRow,
} from '../../webview/diffView';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  grabPointer,
  matchMarks,
  Minimap,
  minimapMarks,
  minimapScrollTop,
  pointerFraction,
} from '../../webview/minimap';
import { noModifiers } from '../fixtures';

const line = (kind: 'added' | 'removed' | 'context'): DiffRow => ({
  kind: 'line',
  file: 0,
  line: { kind, text: '', oldNumber: undefined, newNumber: undefined },
});

function minimap(viewport: number): string {
  return renderToStaticMarkup(
    <Minimap
      marks={[{ kind: 'added', top: 0.25, height: 0.5 }]}
      scrollTop={100}
      viewport={viewport}
      total={400}
      onScroll={() => {}}
    />,
  );
}

suite('Minimap', () => {
  test('takes the pointer it is pressed with, starting no text selection, so dragging it scrolls even with text selected', () => {
    const calls: string[] = [];
    const grabbed = grabPointer({
      button: 0,
      ...noModifiers,
      pointerId: 7,
      preventDefault: () => calls.push('preventDefault'),
      currentTarget: {
        setPointerCapture: (id: number) => calls.push(`capture ${id}`),
      },
    });
    assert.strictEqual(grabbed, true);
    assert.deepStrictEqual(calls, ['preventDefault', 'capture 7']);
  });

  test('leaves a press of any but the main button alone, as the scrollbars do, so a right or middle click does not scroll', () => {
    for (const button of [1, 2, 3, 4]) {
      const calls: string[] = [];
      const grabbed = grabPointer({
        button,
        ...noModifiers,
        pointerId: 7,
        preventDefault: () => calls.push('preventDefault'),
        currentTarget: {
          setPointerCapture: (id: number) => calls.push(`capture ${id}`),
        },
      });
      assert.strictEqual(grabbed, false);
      assert.deepStrictEqual(calls, []);
    }
  });

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
      { kind: 'file', file: 0, path: 'a', open: true },
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
        { kind: 'file', file: 0, path: 'a', open: true },
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

  test('reads how far down the strip the pointer is', () => {
    assert.strictEqual(pointerFraction(150, { top: 100, height: 200 }), 0.25);
    assert.strictEqual(pointerFraction(150, { top: 100, height: 0 }), 0);
  });

  test('centers the view where it is clicked, without scrolling past either end', () => {
    assert.strictEqual(minimapScrollTop(0.5, 1000, 200), 400);
    assert.strictEqual(minimapScrollTop(0.02, 1000, 200), 0);
    assert.strictEqual(minimapScrollTop(0.98, 1000, 200), 800);
  });

  test('draws the marks where they are, and the part in view only when not all of it is', () => {
    const html = minimap(200);
    assert.match(html, /class="minimap-mark added" style="top:25%;height:50%"/);
    assert.match(html, /class="minimap-viewport" style="top:25%;height:50%"/);
    assert.doesNotMatch(minimap(400), /minimap-viewport/);
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
