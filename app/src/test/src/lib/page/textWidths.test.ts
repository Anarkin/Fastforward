import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { textWidths } from '../../../../lib/page/textWidths';
import { terminalCells } from '../../../../lib/page/cellTable';

function measuring(widths: Readonly<Record<string, number>>) {
  return () => ({
    font: '',
    measureText: (text: string) => ({ width: widths[text] ?? 10 }),
  });
}

suite('Widths of text in columns', () => {
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

suite('Code grid', () => {
  test('counts the spacing that puts characters on whole device pixels in the width of each character it measures, so one drawn a column wide with it stays out of a box', async () => {
    const widths = textWidths(
      7 + 1 / 3,
      '12px mono',
      2 / 15,
      await terminalCells(),
      measuring({ é: 7.2, 漢: 14.4 }),
    );
    assert.strictEqual(widths.boxed?.('é'), undefined);
    assert.strictEqual(widths.boxed?.('漢'), 2);
    assert.strictEqual(widths.of('漢'), 2 * (7 + 1 / 3));
  });
});
