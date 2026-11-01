import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { documentImagePath } from '../../ui/images';
import { MarkdownPane } from '../../ui/markdownView';
import { waitFor } from '../fixtures';

const images = {
  path: (src: string) => documentImagePath('README.md', src),
  url: (path: string) => `/viewed?file=${encodeURIComponent(path)}`,
};

async function previewing(
  check: (page: {
    readonly preview: Element;
    readonly show: (text: string) => Promise<void>;
    readonly turnDark: () => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  let dark = false;
  const schemeChanged = new Set<() => void>();
  const reported: unknown[] = [];
  const globals = {
    window: dom.window,
    document: dom.window.document,
    matchMedia: () => ({
      matches: dark,
      addEventListener: (_type: string, listener: () => void) =>
        schemeChanged.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        schemeChanged.delete(listener),
    }),
    reportError: (error: unknown) => reported.push(error),
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
    await check({
      preview: main,
      show: async (text) => {
        await act(async () => {
          root.render(<MarkdownPane text={text} images={images} />);
        });
        await waitFor(async () => {
          await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
          return main.querySelector('.markdown')?.hasChildNodes() ?? false;
        }, 'the preview');
      },
      turnDark: () =>
        act(async () => {
          dark = true;
          for (const changed of schemeChanged) {
            changed();
          }
        }),
    });
    await act(async () => {
      root.unmount();
    });
    assert.deepStrictEqual(reported, []);
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Markdown preview', () => {
  test('loads the images of a document again once the colors switch between light and dark, as its blocks are drawn anew in the new colors', async () => {
    await previewing(async ({ preview, show, turnDark }) => {
      const logo = images.url('docs/logo.png');
      await show('![logo](docs/logo.png)');
      assert.strictEqual(
        preview.querySelector('img')?.getAttribute('src'),
        logo,
      );
      await turnDark();
      assert.strictEqual(
        preview.querySelector('img')?.getAttribute('src'),
        logo,
      );
    });
  });

  test('sanitizes a document with a DOMPurify of its own, so the hooks Mermaid adds to the one it shares leave its links opening in the browser, and its own hooks leave the images of a diagram be', async () => {
    await previewing(async ({ preview, show }) => {
      await show('Loaded.');
      const { default: shared } = await import('dompurify');
      const kept = 'data-temp-href-target';
      shared.addHook('beforeSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.hasAttribute('target')) {
          node.setAttribute(kept, node.getAttribute('target') ?? '');
        }
      });
      shared.addHook('afterSanitizeAttributes', (node) => {
        const target = node.getAttribute(kept);
        if (target !== null) {
          node.setAttribute('target', target);
          node.removeAttribute(kept);
        }
      });
      try {
        await show('<a href="https://example.com" target="_self">Docs</a>');
        assert.strictEqual(
          preview.querySelector('a')?.getAttribute('target'),
          '_blank',
        );
        assert.strictEqual(
          shared.sanitize('<img src="data:image/png;base64,AA">'),
          '<img src="data:image/png;base64,AA">',
        );
      } finally {
        shared.removeAllHooks();
      }
    });
  });
});
