import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { cellsOf, terminalCells, useCellTable } from '../../ui/textWidths';

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
});
