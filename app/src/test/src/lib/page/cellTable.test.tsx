import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import {
  cellsOf,
  terminalCells,
  useCellTable,
} from '../../../../lib/page/textWidths';

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
      const widths = await import('../../../../lib/page/textWidths.js');
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
