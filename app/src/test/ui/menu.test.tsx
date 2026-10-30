import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { MenuButton } from '../../ui/menu';

suite('Menu button', () => {
  test('tells assistive technology it opens a menu, and that the menu is closed', () => {
    const trigger = new JSDOM(
      renderToStaticMarkup(<MenuButton title="Settings" items={[]} />),
    ).window.document.querySelector('button');
    assert.strictEqual(trigger?.getAttribute('aria-haspopup'), 'menu');
    assert.strictEqual(trigger.getAttribute('aria-expanded'), 'false');
  });

  test('closes its menu once the focus moves out of it, as to the menu of another button, but not while it moves within', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element,
      Node: dom.window.Node,
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
      const items = [
        { label: 'C:', onClick: () => {} },
        { label: 'D:', onClick: () => {} },
      ];
      await act(async () => {
        root.render(
          <>
            <MenuButton title="Left" items={items} />
            <MenuButton title="Right" items={items} />
          </>,
        );
      });
      const [left, right] = main.querySelectorAll<HTMLButtonElement>(
        '.menu-button-trigger',
      );
      assert.ok(left && right);
      const openMenus = () => main.querySelectorAll('.menu').length;

      await act(async () => left.click());
      const [first, second] =
        main.querySelectorAll<HTMLButtonElement>('.menu .menu-item');
      assert.ok(first && second);
      await act(async () => second.focus());
      assert.strictEqual(openMenus(), 1);

      await act(async () => right.click());
      await act(async () =>
        main
          .querySelectorAll<HTMLButtonElement>('.menu .menu-item')[2]
          ?.focus(),
      );
      assert.strictEqual(openMenus(), 1);
      assert.strictEqual(left.getAttribute('aria-expanded'), 'false');
      assert.strictEqual(right.getAttribute('aria-expanded'), 'true');
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
