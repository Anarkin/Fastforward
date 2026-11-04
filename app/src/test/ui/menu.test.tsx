import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { filteredItems, MenuButton } from '../../ui/menu';

const triggerOf = (button: React.ReactElement) =>
  new JSDOM(renderToStaticMarkup(button)).window.document.querySelector(
    'button',
  );

async function rendered(
  element: React.ReactElement,
  check: (main: HTMLElement, window: JSDOM['window']) => Promise<void>,
) {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
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
    await act(async () => {
      root.render(element);
    });
    await check(main, dom.window);
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const labelsOf = (items: ReturnType<typeof filteredItems>) =>
  items.map((item) => ('separator' in item ? '-' : item.label));

suite('Menu button', () => {
  test('tells assistive technology it opens a menu, and that the menu is closed', () => {
    const trigger = new JSDOM(
      renderToStaticMarkup(<MenuButton title="Settings" items={[]} />),
    ).window.document.querySelector('button');
    assert.strictEqual(trigger?.getAttribute('aria-haspopup'), 'menu');
    assert.strictEqual(trigger.getAttribute('aria-expanded'), 'false');
  });

  test('marks a button showing the choice made with an arrow, as it opens a list of the others, but not a button showing an icon', () => {
    const labelled = triggerOf(
      <MenuButton title="Encoding" label="UTF-8" items={[]} />,
    );
    assert.strictEqual(
      labelled?.querySelector('.menu-button-label')?.textContent,
      'UTF-8',
    );
    assert.ok(labelled.querySelector('.dropdown-icon'));
    assert.ok(labelled.classList.contains('labelled'));
    const iconOnly = triggerOf(<MenuButton title="Settings" items={[]} />);
    assert.strictEqual(iconOnly?.querySelector('.dropdown-icon'), null);
    assert.ok(!iconOnly.classList.contains('labelled'));
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
  test('keeps the items whose label or keywords have every word of the filter, ignoring case, and drops the separators while filtering', () => {
    const items = [
      { label: 'Auto: TypeScript', keywords: 'ts typescript' },
      { separator: true as const },
      { label: 'JavaScript', keywords: 'js javascript' },
      { label: 'TypeScript', keywords: 'ts typescript' },
      { label: 'TSX', keywords: 'tsx' },
    ];

    assert.deepStrictEqual(labelsOf(filteredItems(items, '')), [
      'Auto: TypeScript',
      '-',
      'JavaScript',
      'TypeScript',
      'TSX',
    ]);
    assert.deepStrictEqual(labelsOf(filteredItems(items, 'TS')), [
      'Auto: TypeScript',
      'TypeScript',
      'TSX',
    ]);
    assert.deepStrictEqual(labelsOf(filteredItems(items, 'type auto')), [
      'Auto: TypeScript',
    ]);
    assert.deepStrictEqual(labelsOf(filteredItems(items, 'java ts')), []);
  });

  test('opens a menu with a filter with the focus in the filter, narrows the items as it is typed in, chooses the first left on Enter and moves into them on Down', async () => {
    const chosen: string[] = [];
    const items = ['Plain Text', 'JavaScript', 'TypeScript'].map((label) => ({
      label,
      onClick: () => chosen.push(label),
    }));
    await rendered(
      <MenuButton title="Language" label="Auto" filter="Find" items={items} />,
      async (main, window) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          '.menu-button-trigger',
        );
        await act(async () => trigger?.click());
        const filter = main.querySelector<HTMLInputElement>('.menu-filter');
        assert.ok(filter);
        assert.strictEqual(window.document.activeElement, filter);
        assert.strictEqual(filter.placeholder, 'Find');
        const shown = () =>
          Array.from(main.querySelectorAll('.menu .menu-item')).map(
            (item) => item.textContent,
          );

        await act(async () => {
          Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set?.call(filter, 'script');
          filter.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
        assert.deepStrictEqual(shown(), ['JavaScript', 'TypeScript']);

        await act(async () =>
          filter.dispatchEvent(
            new window.KeyboardEvent('keydown', {
              key: 'ArrowDown',
              bubbles: true,
            }),
          ),
        );
        assert.strictEqual(
          window.document.activeElement?.textContent,
          'JavaScript',
        );

        await act(async () => filter.focus());
        await act(async () =>
          filter.dispatchEvent(
            new window.KeyboardEvent('keydown', {
              key: 'Enter',
              bubbles: true,
            }),
          ),
        );
        assert.deepStrictEqual(chosen, ['JavaScript']);
        assert.strictEqual(main.querySelector('.menu'), null);
      },
    );
  });
});
