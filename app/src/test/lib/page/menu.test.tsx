import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { filteredItems, MenuButton } from '../../../lib/page/menu';

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
  test('sets the label of its button apart as a name when the label is one, as a drive', () => {
    const named = triggerOf(
      <MenuButton title="Drive" label="C:" named items={[]} />,
    );
    const plain = triggerOf(
      <MenuButton title="Layout" label="Details" items={[]} />,
    );
    assert.strictEqual(
      named?.querySelector('.menu-button-label code.name')?.textContent,
      'C:',
    );
    assert.strictEqual(plain?.querySelector('.menu-button-label code'), null);
  });

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

  test('marks a button showing an icon with an arrow when asked, as one whose click opens a list rather than turning the icon on', () => {
    const arrowed = triggerOf(
      <MenuButton
        title="Bookmarks"
        icon={<svg className="icon star" />}
        arrow
        items={[]}
      />,
    );
    assert.ok(arrowed);
    assert.ok(arrowed.querySelector('.star'));
    assert.ok(arrowed.querySelector('.dropdown-icon'));
    assert.ok(arrowed.classList.contains('arrowed'));
    assert.strictEqual(arrowed.querySelector('.menu-button-label'), null);
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

  test('opens a menu with a filter with the focus in the filter, narrows the items as it is typed in, chooses the first left on Enter and moves into them on Down, an item taking the focus only once the pointer moves over it rather than once the list moves under the pointer', async () => {
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

        const [first, second] =
          main.querySelectorAll<HTMLButtonElement>('.menu .menu-item');
        assert.ok(first && second);
        await act(async () => filter.focus());
        await act(async () =>
          second.dispatchEvent(
            new window.MouseEvent('mouseover', { bubbles: true }),
          ),
        );
        assert.strictEqual(window.document.activeElement, filter);
        await act(async () =>
          second.dispatchEvent(
            new window.MouseEvent('mousemove', { bubbles: true }),
          ),
        );
        assert.strictEqual(window.document.activeElement, second);
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
  test('tells once an item is chosen, from a submenu too, after the item acts, so the focus can go where the choice is used, keeping it on its button once closed without a choice', async () => {
    const told: string[] = [];
    await rendered(
      <>
        <MenuButton
          title="Drive"
          label="C:"
          items={[
            { label: 'D:', onClick: () => told.push('D:') },
            {
              label: 'More',
              submenu: [{ label: 'E:', onClick: () => told.push('E:') }],
            },
          ]}
          onChosen={() => {
            told.push('chosen');
            document.querySelector<HTMLElement>('.list')?.focus();
          }}
        />
        <div className="list" tabIndex={-1} />
      </>,
      async (main, window) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          '.menu-button-trigger',
        );
        const list = main.querySelector('.list');
        assert.ok(trigger);
        const item = (label: string) =>
          [...main.querySelectorAll<HTMLButtonElement>('.menu-item')].find(
            (each) => each.textContent.endsWith(label),
          );
        const focused: string[] = [];
        const noteFocus = () => {
          const active = window.document.activeElement;
          focused.push(
            active === list ? 'list' : active === trigger ? 'button' : 'other',
          );
        };
        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        await act(async () => item('D:')?.click());
        noteFocus();

        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        await act(async () => item('More')?.click());
        await act(async () => item('E:')?.click());
        noteFocus();

        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        await act(async () =>
          main.querySelector('.menu')?.dispatchEvent(
            new window.KeyboardEvent('keydown', {
              key: 'Escape',
              bubbles: true,
            }),
          ),
        );
        noteFocus();
        assert.strictEqual(main.querySelector('.menu'), null);
        assert.deepStrictEqual(focused, ['list', 'list', 'button']);
        assert.deepStrictEqual(told, ['D:', 'chosen', 'E:', 'chosen']);
      },
    );
  });

  test('gives the focus back to its button once a menu with a filter closes, as it held it before the filter took it', async () => {
    await rendered(
      <MenuButton
        title="Language"
        label="Auto"
        filter="Find"
        items={[{ label: 'Plain Text', onClick: () => {} }]}
      />,
      async (main, window) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          '.menu-button-trigger',
        );
        assert.ok(trigger);
        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        const filter = main.querySelector<HTMLInputElement>('.menu-filter');
        assert.strictEqual(window.document.activeElement, filter);
        await act(async () =>
          filter?.dispatchEvent(
            new window.KeyboardEvent('keydown', {
              key: 'Escape',
              bubbles: true,
            }),
          ),
        );
        assert.strictEqual(main.querySelector('.menu'), null);
        assert.strictEqual(window.document.activeElement, trigger);
      },
    );
  });
});
