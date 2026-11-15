import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { AddressBar } from '../../../../../tools/git/page/addressBar';
import { GitStore } from '../../../../../tools/git/page/store';
import { gitStore, renderIn } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';

suite('Navigation bar', () => {
  test('shows nothing of the commit search until it is opened, as the button opening it sits among the buttons of the column', () => {
    const html = renderToStaticMarkup(
      <GitStore value={gitStore()}>
        <AddressBar />
      </GitStore>,
    );
    assert.doesNotMatch(html, /address-bar|Search…|<button/);
  });

  test('keeps the query searched for in a worktree while another tool is shown, as the search is drawn again on coming back', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    dom.window.HTMLElement.prototype.scrollIntoView = noop;
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
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
      const store = gitStore({ tab: { root: '/repo' } });
      store.setState({ searching: new Set(['/repo']) });
      const field = () =>
        dom.window.document.querySelector<HTMLInputElement>(
          '.locations-popup .search-box-input',
        );
      let root = createRoot(main);
      await act(async () => {
        renderIn(
          root,
          <GitStore value={store}>
            <AddressBar />
          </GitStore>,
        );
      });
      const typed = field();
      assert.ok(typed);
      assert.ok(
        !typed.closest('.search-bar')?.classList.contains('monospace'),
        'the font of the names and messages it searches',
      );
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value',
        )?.set?.call(typed, 'fix');
        typed.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      assert.strictEqual(field()?.value, 'fix');
      await act(async () => root.unmount());
      root = createRoot(main);
      await act(async () => {
        renderIn(
          root,
          <GitStore value={store}>
            <AddressBar />
          </GitStore>,
        );
      });
      assert.strictEqual(field()?.value, 'fix');
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
