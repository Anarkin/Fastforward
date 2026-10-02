import * as assert from 'node:assert';
import { minimapRows, type DiffRow } from '../webview/diffView';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Minimap,
  minimapMarks,
  minimapScrollTop,
  pointerFraction,
} from '../webview/minimap';

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
    const total = 22 + 7 * 20;
    assert.deepStrictEqual(minimapMarks(rows), [
      { kind: 'removed', top: 42 / total, height: 20 / total },
      { kind: 'added', top: 62 / total, height: 40 / total },
      { kind: 'added', top: 142 / total, height: 20 / total },
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
      { kind: 'added', top: 62 / 82, height: 20 / 82 },
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
});
