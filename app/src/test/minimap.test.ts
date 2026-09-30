import * as assert from 'node:assert';
import { minimapRows, type DiffRow } from '../webview/diffView';
import { minimapMarks, minimapScrollTop } from '../webview/minimap';

const line = (kind: 'added' | 'removed' | 'context'): DiffRow => ({
  kind: 'line',
  file: 0,
  line: { kind, text: '', oldNumber: undefined, newNumber: undefined },
});

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
    const total = 28 + 7 * 20;
    assert.deepStrictEqual(minimapMarks(rows), [
      { kind: 'removed', top: 48 / total, height: 20 / total },
      { kind: 'added', top: 68 / total, height: 40 / total },
      { kind: 'added', top: 148 / total, height: 20 / total },
    ]);
  });

  test('marks nothing in an empty or unchanged file', () => {
    assert.deepStrictEqual(minimapMarks([]), []);
    assert.deepStrictEqual(
      minimapMarks(minimapRows([line('context'), line('context')])),
      [],
    );
  });

  test('centers the view where it is clicked, without scrolling past either end', () => {
    assert.strictEqual(minimapScrollTop(0.5, 1000, 200), 400);
    assert.strictEqual(minimapScrollTop(0.02, 1000, 200), 0);
    assert.strictEqual(minimapScrollTop(0.98, 1000, 200), 800);
  });
});
