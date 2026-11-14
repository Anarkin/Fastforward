import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellParts, textWidths } from '../../../../lib/page/textWidths';
import { terminalCells } from '../../../../lib/page/cellTable';

function measuring(widths: Readonly<Record<string, number>>) {
  return () => ({
    font: '',
    measureText: (text: string) => ({ width: widths[text] ?? 10 }),
  });
}

suite('Widths of text in columns', () => {
  test('splits text into the runs left as they are and the characters put in boxes, with the size a glyph wider than its box is shrunk to', () => {
    const widths = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (/[😀中]/u.test(cluster) ? 2 : undefined),
      scaled: (cluster: string) => (cluster === '😀' ? 0.875 : undefined),
    };
    assert.deepStrictEqual(cellParts('ab😀c中', widths), [
      { text: 'ab' },
      { text: '😀', cells: 2, scale: 0.875 },
      { text: 'c' },
      { text: '中', cells: 2, scale: undefined },
    ]);
    assert.deepStrictEqual(cellParts('plain', widths), [{ text: 'plain' }]);
    assert.deepStrictEqual(cellParts('😀', { char: 10, of: () => 20 }), [
      { text: '😀' },
    ]);
  });

  test('puts a character drawn wider or narrower than its columns in a box exactly as wide as them, so the text after it stays on the grid, and leaves one drawn as wide as its columns as it is', async () => {
    const widths = textWidths(
      10,
      '12px mono',
      0,
      await terminalCells(),
      measuring({ '😀': 22.9, 中: 16.7, é: 10, '✔': 13 }),
    );
    assert.strictEqual(widths.boxed?.('😀'), 2);
    assert.strictEqual(widths.boxed?.('中'), 2);
    assert.strictEqual(widths.boxed?.('✔'), 1);
    assert.strictEqual(widths.boxed?.('é'), undefined);
    assert.strictEqual(widths.of('😀'), 20);
    assert.strictEqual(widths.of('é'), 10);
  });
});
