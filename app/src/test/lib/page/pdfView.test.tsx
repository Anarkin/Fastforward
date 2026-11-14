import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { viewerKeymap } from '../../../tools/commander/page/keymap';
import type {
  PdfEvents,
  PdfFound,
  ShownPdf,
} from '../../../lib/page/pdfDocument';
import { PdfPane } from '../../../lib/page/pdfView';
import { noop, waitFor } from '../../support/fixtures';

interface Opening {
  readonly size: number;
  readonly events: PdfEvents;
  readonly shown: PromiseWithResolvers<ShownPdf | undefined>;
}

const openings = vi.hoisted((): Opening[] => []);

vi.mock('../../../lib/page/pdfDocument', () => ({
  showPdf: (
    _container: unknown,
    _url: string,
    size: number,
    events: PdfEvents,
  ) => {
    const shown = Promise.withResolvers<ShownPdf | undefined>();
    openings.push({ size, events, shown });
    return shown.promise;
  },
  pdfFailure: (error: unknown) => `Failed: ${String(error)}`,
}));

const shownPdf: ShownPdf = {
  fingerprint: 'book',
  find: noop,
  closeFind: noop,
  zoomBy: noop,
  tellPlace: noop,
  close: noop,
};

async function paned(
  check: (pane: {
    readonly main: Element;
    readonly outside: HTMLInputElement;
    readonly founds: PdfFound[];
    readonly show: (size: number, query?: string) => void;
    readonly leave: () => void;
  }) => Promise<void>,
): Promise<void> {
  openings.length = 0;
  const dom = new JSDOM('<!doctype html><main></main><input>');
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
    const outside = dom.window.document.querySelector('input');
    assert.ok(main);
    assert.ok(outside);
    const founds: PdfFound[] = [];
    const root = createRoot(main);
    let left = false;
    await check({
      main,
      outside,
      founds,
      show: (size, query = '') =>
        act(() => {
          root.render(
            <PdfPane
              url="viewed?file=book.pdf"
              size={size}
              query={query}
              zoomKeys={viewerKeymap.zoomPdf}
              placeOf={() => Promise.resolve(undefined)}
              onPlace={noop}
              onFound={(found) => founds.push(found)}
              onShown={noop}
            />,
          );
        }),
      leave: () =>
        act(() => {
          left = true;
          root.unmount();
        }),
    });
    if (!left) {
      act(() => root.unmount());
    }
  } finally {
    Object.assign(globalThis, saved);
  }
}

const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 20)));

const failureOf = (main: Element) =>
  main.querySelector('.pdf-failure')?.textContent;

suite('PDF pane', () => {
  test('takes away what it said of a PDF it could not show once the file changes, as the failure of a file cut short for a moment stayed over the PDF shown again', async () => {
    await paned(async ({ main, show }) => {
      show(0);
      await waitFor(() => openings.length === 1, 'the PDF opened');
      await act(async () => {
        openings[0]?.shown.reject(new Error('Empty'));
        await Promise.resolve();
      });
      await settle();
      assert.strictEqual(failureOf(main), 'Failed: Error: Empty');

      show(10);
      await waitFor(() => openings.length === 2, 'the PDF opened again');
      assert.strictEqual(failureOf(main), undefined);
      await act(async () => {
        openings[1]?.shown.resolve(shownPdf);
        await Promise.resolve();
      });
      assert.strictEqual(failureOf(main), undefined);
    });
  });

  test('says a PDF shown could not be shown once part of it could not be read', async () => {
    await paned(async ({ main, show }) => {
      show(10);
      await waitFor(() => openings.length === 1, 'the PDF opened');
      await act(async () => {
        openings[0]?.shown.resolve(shownPdf);
        await Promise.resolve();
      });

      act(() => openings[0]?.events.onFailure(new Error('Unread')));

      assert.strictEqual(failureOf(main), 'Failed: Error: Unread');
    });
  });

  test('keeps the focus where it is once the file changes and searches the PDF shown again for what the find has, as it took the focus from the find and its count stayed of the PDF before', async () => {
    await paned(async ({ main, outside, founds, show }) => {
      show(10);
      const pane = main.querySelector<HTMLElement>('.pdf-scroll');
      await waitFor(() => openings.length === 1, 'the PDF opened');
      assert.ok(
        pane?.ownerDocument.activeElement === pane,
        'the pane took the focus',
      );
      await act(async () => {
        openings[0]?.shown.resolve(shownPdf);
        await Promise.resolve();
      });

      outside.focus();
      show(20, 'fox');
      await waitFor(() => openings.length === 2, 'the PDF opened again');
      assert.ok(
        outside.ownerDocument.activeElement === outside,
        'the find kept the focus',
      );
      assert.deepStrictEqual(founds, [{ current: 0, total: 0, done: false }]);
      const finds: [string, number][] = [];
      await act(async () => {
        openings[1]?.shown.resolve({
          ...shownPdf,
          find: (query, step) => finds.push([query, step]),
        });
        await Promise.resolve();
      });
      assert.deepStrictEqual(finds, [['fox', 0]]);

      act(() => pane?.focus());
      show(30, 'fox');
      await waitFor(() => openings.length === 3, 'the PDF opened once more');
      assert.ok(
        pane?.ownerDocument.activeElement === pane,
        'the pane kept the focus',
      );
    });
  });

  test('opens no PDF given up on before PDF.js had loaded', async () => {
    await paned(async ({ show, leave }) => {
      show(10);
      leave();
      await settle();
      await settle();

      assert.strictEqual(openings.length, 0);
    });
  });
});
