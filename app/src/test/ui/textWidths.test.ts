import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellsOf, terminalCells, textWidths } from '../../ui/textWidths';

function measuring(widths: Readonly<Record<string, number>>) {
  return () => ({
    font: '',
    measureText: (text: string) => ({ width: widths[text] ?? 10 }),
  });
}

suite('Widths of text in columns', () => {
  test('counts the columns of a character as our terminal does, an emoji or a Chinese, Japanese or Korean character two, any other one and a joining mark none', async () => {
    const table = await terminalCells();
    for (const [cluster, cells] of [
      ['a', 1],
      ['é', 1],
      ['é', 1],
      ['─', 1],
      ['←', 1],
      ['©', 1],
      ['⚠', 1],
      ['中', 2],
      ['の', 2],
      ['한', 2],
      ['😀', 2],
      ['✅', 2],
      ['​', 0],
    ] as const) {
      assert.strictEqual(cellsOf(cluster, table), cells, cluster);
    }
  });

  test('counts an emoji of several code points two columns, drawn as one, as Windows Terminal does: joined, with a skin tone, a flag, a keycap, or a symbol asked to be an emoji', async () => {
    const table = await terminalCells();
    for (const cluster of ['👨‍👩‍👧‍👦', '👩‍💻', '👍🏽', '🏳️‍🌈', '🇭🇺', '1️⃣', '⚠️', '©️']) {
      assert.strictEqual(cellsOf(cluster, table), 2, cluster);
    }
    assert.strictEqual(cellsOf('✅︎', table), 1);
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
