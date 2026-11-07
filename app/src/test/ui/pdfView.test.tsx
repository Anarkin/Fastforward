import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { viewerKeymap } from '../../tools/commander/shared/keymap';
import type { PdfEvents, ShownPdf } from '../../ui/pdfDocument';
import { PdfPane } from '../../ui/pdfView';
import { noop, waitFor } from '../fixtures';

interface Opening {
  readonly size: number;
  readonly events: PdfEvents;
  readonly shown: PromiseWithResolvers<ShownPdf | undefined>;
}

const openings = vi.hoisted((): Opening[] => []);

vi.mock('../../ui/pdfDocument', () => ({
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
    readonly show: (size: number) => void;
    readonly leave: () => void;
  }) => Promise<void>,
): Promise<void> {
  openings.length = 0;
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
    let left = false;
    await check({
      main,
      show: (size) =>
        act(() => {
          root.render(
            <PdfPane
              url="viewed?file=book.pdf"
              size={size}
              zoomKeys={viewerKeymap.zoomPdf}
              placeOf={() => Promise.resolve(undefined)}
              onPlace={noop}
              onFound={noop}
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
