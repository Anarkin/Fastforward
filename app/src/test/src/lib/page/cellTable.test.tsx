import * as assert from 'node:assert';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import { Terminal } from '@xterm/headless';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import {
  cellsOf,
  terminalCells,
  useCellTable,
} from '../../../../lib/page/cellTable';

async function terminalColumns(text: string): Promise<number> {
  const terminal = new Terminal({ cols: 40, rows: 2, allowProposedApi: true });
  terminal.loadAddon(new UnicodeGraphemesAddon());
  await new Promise<void>((resolve) => terminal.write(text, resolve));
  const columns = terminal.buffer.active.cursorX;
  terminal.dispose();
  return columns;
}

function Columns() {
  return <>{cellsOf('中', useCellTable())}</>;
}

suite('Widths of text in columns on a page', () => {
  test('counts a Chinese character one column until the table of our terminal loads, then two, keeping the table as it is rather than calling it as an update, as that crashed the page', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await act(async () => {
        root.render(<Columns />);
      });
      await act(async () => {
        await terminalCells();
      });
      assert.strictEqual(main.textContent, '2');
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('leaves the table alone once the page that asked for it is gone, as setting it then broke a page torn down while the table loaded', async () => {
    vi.resetModules();
    const loads = Promise.withResolvers<void>();
    vi.doMock('@xterm/addon-unicode-graphemes', async (importOriginal) => {
      await loads.promise;
      return importOriginal();
    });
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    const rejected: unknown[] = [];
    const onRejected = (reason: unknown) => rejected.push(reason);
    process.on('unhandledRejection', onRejected);
    Object.assign(globalThis, globals);
    try {
      const react = await import('react');
      const { createRoot } = await import('react-dom/client');
      const widths = await import('../../../../lib/page/cellTable.js');
      const Fresh = () =>
        react.createElement(
          react.Fragment,
          null,
          widths.cellsOf('中', widths.useCellTable()),
        );
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await react.act(async () => {
        root.render(react.createElement(Fresh));
      });
      await react.act(async () => {
        root.unmount();
      });
      Object.assign(globalThis, saved);
      loads.resolve();
      await widths.terminalCells();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepStrictEqual(rejected, []);
    } finally {
      process.off('unhandledRejection', onRejected);
      vi.doUnmock('@xterm/addon-unicode-graphemes');
      Object.assign(globalThis, saved);
    }
  });
});

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
});
