import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { noop } from '../../../helpers/fixtures';
import { MenuButton } from '../../../../lib/page/menu';
import { defaultScrolling } from '../../../../lib/page/scrollSettings';

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
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    MutationObserver: dom.window.MutationObserver,
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

async function openedMenu(
  tall: number,
  items: Parameters<typeof MenuButton>[0]['items'],
  across = { x: 0, width: 200 },
) {
  let seen: { scrolls: boolean; tallest: string; moved: string } | undefined;
  await rendered(
    <MenuButton
      scrolling={defaultScrolling}
      title="Bookmarks"
      label="Bookmarks"
      items={items}
    />,
    async (main, window) => {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 600,
      });
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1000,
      });
      Object.defineProperty(
        window.HTMLElement.prototype,
        'getBoundingClientRect',
        {
          configurable: true,
          value(this: HTMLElement) {
            const scrolls = this.classList.contains('scrolls');
            return window.DOMRect.fromRect({
              x: across.x + (parseFloat(this.style.marginLeft) || 0),
              y: 100,
              width: across.width + (scrolls ? 20 : 0),
              height: tall,
            });
          },
        },
      );
      Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get: () => tall,
      });
      await act(async () =>
        main.querySelector<HTMLButtonElement>('.menu-button-trigger')?.click(),
      );
      const menu = main.querySelector<HTMLElement>('.menu');
      assert.ok(menu);
      seen = {
        scrolls: menu.classList.contains('scrolls'),
        tallest: menu.style.maxHeight,
        moved: menu.style.marginLeft,
      };
    },
  );
  return seen;
}

suite('Menu button', () => {
  test('sets the label of its button apart as a name when the label is one, as a drive', () => {
    const named = triggerOf(
      <MenuButton
        scrolling={defaultScrolling}
        title="Drive"
        label="C:"
        path
        items={[]}
      />,
    );
    const plain = triggerOf(
      <MenuButton
        scrolling={defaultScrolling}
        title="Layout"
        label="Details"
        items={[]}
      />,
    );
    assert.strictEqual(
      named?.querySelector('.menu-button-label code.name')?.textContent,
      'C:',
    );
    assert.strictEqual(plain?.querySelector('.menu-button-label code'), null);
  });

  test('tells assistive technology it opens a menu, and that the menu is closed', () => {
    const trigger = new JSDOM(
      renderToStaticMarkup(
        <MenuButton scrolling={defaultScrolling} title="Settings" items={[]} />,
      ),
    ).window.document.querySelector('button');
    assert.strictEqual(trigger?.getAttribute('aria-haspopup'), 'menu');
    assert.strictEqual(trigger.getAttribute('aria-expanded'), 'false');
  });

  test('marks a button showing the choice made with an arrow, as it opens a list of the others, but not a button showing an icon', () => {
    const labelled = triggerOf(
      <MenuButton
        scrolling={defaultScrolling}
        title="Encoding"
        label="UTF-8"
        items={[]}
      />,
    );
    assert.strictEqual(
      labelled?.querySelector('.menu-button-label')?.textContent,
      'UTF-8',
    );
    assert.ok(labelled.querySelector('.dropdown-icon'));
    assert.ok(labelled.classList.contains('labelled'));
    const iconOnly = triggerOf(
      <MenuButton scrolling={defaultScrolling} title="Settings" items={[]} />,
    );
    assert.strictEqual(iconOnly?.querySelector('.dropdown-icon'), null);
    assert.ok(!iconOnly.classList.contains('labelled'));
  });

  test('marks a button showing an icon with an arrow when asked, as one whose click opens a list rather than turning the icon on', () => {
    const arrowed = triggerOf(
      <MenuButton
        scrolling={defaultScrolling}
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

  test('closes its menu once the focus moves out of it, as to the menu of another button, but not while it moves within, or into the menu of a part of a path opened over it', async () => {
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
            <MenuButton
              scrolling={defaultScrolling}
              title="Left"
              items={items}
            />
            <MenuButton
              scrolling={defaultScrolling}
              title="Right"
              items={items}
            />
            <div className="menu context-menu path-menu">
              <button className="path-menu-item">Copy Path</button>
            </div>
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
      assert.strictEqual(openMenus(), 2);
      await act(async () =>
        main.querySelector<HTMLButtonElement>('.path-menu-item')?.focus(),
      );
      assert.strictEqual(left.getAttribute('aria-expanded'), 'true');
      await act(async () => second.focus());

      await act(async () => right.click());
      await act(async () =>
        main
          .querySelectorAll<HTMLButtonElement>('.menu .menu-item')[2]
          ?.focus(),
      );
      assert.strictEqual(openMenus(), 2);
      assert.strictEqual(left.getAttribute('aria-expanded'), 'false');
      assert.strictEqual(right.getAttribute('aria-expanded'), 'true');
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('opens a menu with a filter with the focus in the filter, narrows the items as it is typed in, chooses the first left on Enter and moves into them on Down, an item taking the focus only once the pointer moves over it rather than once the list moves under the pointer', async () => {
    const chosen: string[] = [];
    const items = ['Plain Text', 'JavaScript', 'TypeScript'].map((label) => ({
      label,
      onClick: () => chosen.push(label),
    }));
    await rendered(
      <MenuButton
        scrolling={defaultScrolling}
        title="Language"
        label="Auto"
        filter="Find"
        items={items}
      />,
      async (main, window) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          '.menu-button-trigger',
        );
        await act(async () => trigger?.click());
        const filter =
          main.querySelector<HTMLInputElement>('.search-box-input');
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
  test('scrolls a menu that would reach past the bottom of the window, no taller than the room below its button, by its whole items, and moves one that would reach past the right edge of the window back inside it, as the bookmarks of the right side went on past the window, out of reach, their scrollbar out of sight, and leaves a menu that fits, or one with a submenu, which scrolling would cut off, as it is', async () => {
    const plain = [{ label: 'One', onClick: noop }];
    assert.deepStrictEqual(await openedMenu(900, plain), {
      scrolls: true,
      tallest: '496px',
      moved: '',
    });
    assert.deepStrictEqual(await openedMenu(300, plain), {
      scrolls: false,
      tallest: '',
      moved: '',
    });
    assert.deepStrictEqual(
      await openedMenu(900, [{ label: 'More', submenu: plain }]),
      { scrolls: false, tallest: '', moved: '' },
    );
    assert.deepStrictEqual(
      await openedMenu(300, plain, { x: 700, width: 500 }),
      {
        scrolls: false,
        tallest: '',
        moved: '-204px',
      },
    );
    assert.deepStrictEqual(
      await openedMenu(300, plain, { x: 100, width: 2000 }),
      {
        scrolls: false,
        tallest: '',
        moved: '-96px',
      },
    );
    assert.deepStrictEqual(
      await openedMenu(900, plain, { x: 700, width: 500 }),
      {
        scrolls: true,
        tallest: '496px',
        moved: '-224px',
      },
    );
  });

  test('keeps a menu with a filter as wide as it opened while it is typed in, so what is typed stays readable when nothing is left to list', async () => {
    const items = ['Windows-1250 Central European', 'UTF-8'].map((label) => ({
      label,
      onClick: noop,
    }));
    await rendered(
      <MenuButton
        scrolling={defaultScrolling}
        title="Encoding"
        label="UTF-8"
        filter="Find"
        items={items}
      />,
      async (main, window) => {
        Object.defineProperty(
          window.HTMLElement.prototype,
          'getBoundingClientRect',
          {
            configurable: true,
            value(this: HTMLElement) {
              return window.DOMRect.fromRect({
                width: this.classList.contains('menu') ? 312.5 : 0,
                height: 20,
              });
            },
          },
        );
        await act(async () =>
          main
            .querySelector<HTMLButtonElement>('.menu-button-trigger')
            ?.click(),
        );
        const menu = main.querySelector<HTMLElement>('.filtered-menu');
        assert.strictEqual(menu?.style.minWidth, '312.5px');
      },
    );
  });

  test('filters in the compact search bar, the counter and the toggles inside its box and no back or step buttons, counting the item with the focus of those kept and matching with its toggles', async () => {
    const items = ['Plain Text', 'JavaScript', 'TypeScript'].map((label) => ({
      label,
      onClick: noop,
    }));
    await rendered(
      <MenuButton
        scrolling={defaultScrolling}
        title="Language"
        label="Auto"
        filter="Find"
        items={items}
      />,
      async (main, window) => {
        await act(async () =>
          main
            .querySelector<HTMLButtonElement>('.menu-button-trigger')
            ?.click(),
        );
        const bar = main.querySelector('.filtered-menu > .search-bar.compact');
        assert.ok(bar);
        assert.deepStrictEqual(
          Array.from(bar.children, (child) => child.className),
          ['search-box'],
        );
        assert.strictEqual(
          bar.querySelectorAll('.search-box .search-toggle').length,
          3,
        );
        const filter = bar.querySelector<HTMLInputElement>('.search-box-input');
        assert.ok(filter);
        const type = (text: string) =>
          act(async () => {
            Reflect.set(
              window.HTMLInputElement.prototype,
              'value',
              text,
              filter,
            );
            filter.dispatchEvent(new window.Event('input', { bubbles: true }));
          });
        const count = () => bar.querySelector('.search-count')?.textContent;
        await type('script');
        assert.strictEqual(count(), '1 of 2');
        const [, second] =
          main.querySelectorAll<HTMLButtonElement>('.menu .menu-item');
        await act(async () => second?.focus());
        assert.strictEqual(count(), '2 of 2');
        await act(async () => filter.focus());
        const matchCase =
          bar.querySelectorAll<HTMLButtonElement>('.search-toggle')[0];
        await act(async () => matchCase?.click());
        assert.strictEqual(matchCase?.getAttribute('aria-pressed'), 'true');
        assert.strictEqual(count(), 'No matches');
        await type('Script');
        assert.strictEqual(count(), '1 of 2');
        await type('^java');
        const regex =
          bar.querySelectorAll<HTMLButtonElement>('.search-toggle')[2];
        await act(async () => regex?.click());
        await act(async () => matchCase?.click());
        assert.deepStrictEqual(
          Array.from(
            main.querySelectorAll('.menu .menu-item'),
            (item) => item.textContent,
          ),
          ['JavaScript'],
        );
      },
    );
  });

  test('tells once an item is chosen, from a submenu too, after the item acts, so the focus can go where the choice is used, keeping it on its button once closed without a choice', async () => {
    const told: string[] = [];
    await rendered(
      <>
        <MenuButton
          scrolling={defaultScrolling}
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
        scrolling={defaultScrolling}
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
        const filter =
          main.querySelector<HTMLInputElement>('.search-box-input');
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
