import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import type { ToWebview } from '../../../../shell/shared/protocol';
import { Crash, ErrorBoundary } from '../../../../shell/page/errorBoundary';
import { renderedBy } from '../../../helpers/fixtures';

const noop = () => {};

const listen = () => noop;

function Broken(): React.ReactNode {
  throw new Error('boom');
}

suite('Error boundary', () => {
  test('shows the window as it is while nothing fails', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary
        title="Fastforward"
        onError={noop}
        listen={listen}
        onQuit={noop}
      >
        <span>window</span>
      </ErrorBoundary>,
    );
    assert.strictEqual(html, '<span>window</span>');
  });

  test('shows a failure to draw the window and a way to reload it, under the title bar to drag the window by', () => {
    const boundary = new ErrorBoundary({
      title: 'Fastforward 1.2.3',
      onError: noop,
      listen,
      onQuit: noop,
      children: null,
    });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /class="title-bar"/);
    assert.match(html, />Fastforward 1.2.3<\/span>/);
    assert.match(html, /<div class="error-message">[^<]*boom<\/div>/);
    assert.match(html, /<button[^>]*>Reload<\/button>/);
  });

  test('shows what was thrown when it is no error', () => {
    const html = renderToStaticMarkup(
      <Crash
        title="Fastforward"
        error="boom"
        onReload={noop}
        listen={listen}
        onQuit={noop}
      />,
    );
    assert.match(html, /<div class="error-message">[^<]*boom<\/div>/);
  });

  test('logs the failure with the components it happened in', () => {
    const logged: string[] = [];
    const boundary = new ErrorBoundary({
      title: 'Fastforward',
      onError: (message) => logged.push(message),
      listen,
      onQuit: noop,
      children: null,
    });
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at f (webview.js:1:2)';
    boundary.componentDidCatch(error, { componentStack: '\n    at Diff' });
    assert.deepStrictEqual(logged, [
      'Error: boom\n    at f (webview.js:1:2)\n    at Diff',
    ]);
  });

  test('reloads the window on its button', () => {
    let reloads = 0;
    const crash = renderedBy(Crash, {
      title: 'Fastforward',
      error: new Error('boom'),
      onReload: () => reloads++,
      listen,
      onQuit: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(crash));
    const body = crash.props.children[1];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(body));
    const button = body.props.children[1];
    assert.ok(isValidElement<{ onClick: () => void }>(button));
    button.props.onClick();
    assert.strictEqual(reloads, 1);
  });

  test('asks before quitting once the window failed to draw, quitting only once confirmed, as nothing answered the question and the window would not close while a terminal was open', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    const consoleError = console.error;
    console.error = noop;
    try {
      const { createRoot } = await import('react-dom/client');
      const { document } = dom.window;
      const main = document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main, { onCaughtError: noop });
      const handlers = new Set<(message: ToWebview) => void>();
      let quits = 0;
      await act(async () => {
        root.render(
          <ErrorBoundary
            title="Fastforward"
            onError={noop}
            listen={(handler) => {
              handlers.add(handler);
              return () => handlers.delete(handler);
            }}
            onQuit={() => quits++}
          >
            <Broken />
          </ErrorBoundary>,
        );
      });
      const send = (message: ToWebview) =>
        act(async () => {
          for (const handler of handlers) {
            handler(message);
          }
        });
      const dialog = () => document.querySelector('[role="dialog"]');
      const button = (label: string) =>
        Array.from(document.querySelectorAll('.confirm-button')).find(
          (each) => each.textContent === label,
        );
      assert.ok(document.querySelector('.crash'));
      assert.strictEqual(dialog(), null);
      await send({ type: 'confirmQuit' });
      assert.strictEqual(
        dialog()?.getAttribute('aria-label'),
        strings.confirm.quitTitle,
      );
      assert.strictEqual(document.activeElement, button(strings.confirm.quit));
      await act(async () => {
        button(strings.confirm.cancel)?.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true }),
        );
      });
      assert.strictEqual(dialog(), null);
      assert.strictEqual(quits, 0);
      await send({ type: 'confirmQuit' });
      await act(async () => {
        button(strings.confirm.quit)?.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true }),
        );
      });
      assert.strictEqual(quits, 1);
      assert.strictEqual(dialog(), null);
      await act(async () => {
        root.unmount();
      });
      assert.strictEqual(handlers.size, 0);
    } finally {
      console.error = consoleError;
      Object.assign(globalThis, saved);
    }
  });
});
