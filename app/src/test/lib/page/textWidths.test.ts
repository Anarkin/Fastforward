import * as assert from 'node:assert';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import { Terminal } from '@xterm/headless';
import { suite, test } from 'vitest';
import {
  cellParts,
  cellsOf,
  terminalCells,
  textWidths,
} from '../../../lib/page/textWidths';

async function terminalColumns(text: string): Promise<number> {
  const terminal = new Terminal({ cols: 40, rows: 2, allowProposedApi: true });
  terminal.loadAddon(new UnicodeGraphemesAddon());
  await new Promise<void>((resolve) => terminal.write(text, resolve));
  const columns = terminal.buffer.active.cursorX;
  terminal.dispose();
  return columns;
}

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
    ] as const) {
      assert.strictEqual(cellsOf(cluster, table), cells, cluster);
    }
  });

  test('counts an emoji of several code points two columns, drawn as one, as our terminal and Windows Terminal do: joined, with a skin tone, a flag, a keycap, or a symbol asked to be an emoji', async () => {
    const table = await terminalCells();
    for (const cluster of ['👨‍👩‍👧‍👦', '👩‍💻', '👍🏽', '🏳️‍🌈', '🇭🇺', '1️⃣', '⚠️', '©️']) {
      assert.strictEqual(cellsOf(cluster, table), 2, cluster);
    }
  });

  test('counts every character as many columns as our terminal does, by its own table and its joining of grapheme clusters, so the viewer, the diff and the terminal draw a line alike', async () => {
    const table = await terminalCells();
    for (const cluster of [
      'a',
      '\u{e9}',
      'e\u{301}',
      '\u{2500}',
      '\u{2190}',
      '\u{a9}',
      '\u{a9}\u{fe0f}',
      '\u{26a0}',
      '\u{26a0}\u{fe0f}',
      '\u{4e2d}',
      '\u{306e}',
      '\u{d55c}',
      '\u{3000}',
      '\u{1f600}',
      '\u{2705}',
      '\u{2705}\u{fe0e}',
      '\u{1fae0}',
      '\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}\u{200d}\u{1f466}',
      '\u{1f469}\u{200d}\u{1f4bb}',
      '\u{1f44d}\u{1f3fd}',
      '\u{1f3f3}\u{fe0f}\u{200d}\u{1f308}',
      '\u{1f1ed}\u{1f1fa}',
      '1\u{fe0f}\u{20e3}',
      '\u{200b}',
    ]) {
      assert.strictEqual(
        cellsOf(cluster, table),
        await terminalColumns(cluster),
        cluster,
      );
    }
  });

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
