import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { onMenuKeyDown } from '../../../../lib/page/menuControls';
import { MenuItems } from '../../../../lib/page/menuItems';
import { defaultScrolling } from '../../../../lib/page/scrollSettings';
import { SubmenuIcon } from '../../../../lib/page/icons';
import { noop } from '../../../helpers/fixtures';
import { keyPress } from '../../../helpers/keys';
import { renderedBy } from '../../../helpers/componentFixtures';
import { tagsWith } from '../../../helpers/markup';
import { named, sentence } from '../../../../lib/shared/sentences';

suite('Menu items', () => {
  test('draws the details of an item before its label, each in a column of its own, marking the words of the filter in them too', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <MenuItems
          scrolling={defaultScrolling}
          items={[
            { label: 'docs: one', details: ['917d84c', '2026-10-12 01:44'] },
          ]}
          filter={plainFilter('917d')}
          onClose={noop}
        />,
      ),
    ).window.document;
    const item = document.querySelector('.menu-item');
    assert.deepStrictEqual(
      [...(item?.children ?? [])].map((child) => [
        child.className,
        child.textContent,
      ]),
      [
        ['menu-check', ''],
        ['menu-detail', '917d84c'],
        ['menu-detail', '2026-10-12 01:44'],
        ['', 'docs: one'],
      ].filter(([className]) => className !== ''),
    );
    assert.strictEqual(
      item?.querySelector('.menu-detail .match')?.textContent,
      '917d',
    );
  });

  test('marks every word of the filter wherever the label of an item shows it, in a name or a sentence too, in the yellow of every filter, and nothing found only in the keywords of an item', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <MenuItems
          scrolling={defaultScrolling}
          items={[
            { label: 'UTF-8' },
            { label: 'Auto: UTF-8, utf' },
            { label: 'Latin', keywords: 'utf' },
            { label: 'C:\\utf-data', path: true },
            {
              label: 'UTF-8, from tools.editor.charset in the settings',
              sentence: sentence`UTF-8, from ${named('tools.editor.charset')} in the settings`,
            },
          ]}
          filter={plainFilter('utf charset')}
          onClose={noop}
        />,
      ),
    ).window.document;

    assert.deepStrictEqual(
      [...document.querySelectorAll('.menu-item')].map((item) =>
        [...item.querySelectorAll('mark.match')].map(
          (mark) => mark.textContent,
        ),
      ),
      [['UTF'], ['UTF', 'utf'], [], ['utf'], ['UTF', 'charset']],
    );
    assert.strictEqual(
      document.querySelectorAll('.menu-item')[3].textContent,
      'C:\\utf-data',
    );
  });

  test('sets an item whose label is a name, as a folder or a drive, apart as a name, and the others in the words of the menu', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[
          { label: 'C:\\', path: true },
          { label: 'Open', onClick: () => undefined },
        ]}
        onClose={() => undefined}
      />,
    );
    assert.deepStrictEqual(
      [...html.matchAll(/<code class="name named-path">(.*?)<\/code>/g)].map(
        ([, inner]) => inner.replaceAll(/<[^>]*>/g, ''),
      ),
      ['C:\\'],
    );
    assert.match(html, />Open</);
  });

  test('keys items apart that have the same label', () => {
    const items = renderedBy(MenuItems, {
      scrolling: defaultScrolling,
      items: [
        { label: 'v1', onClick: noop },
        { separator: true },
        { label: 'v1', onClick: noop },
      ],
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const keys = items.props.children.map((item) => item.key);
    assert.strictEqual(new Set(keys).size, 3);
  });

  test('runs a plain item and closes the menu, but keeps it open on a submenu', () => {
    const log: string[] = [];
    const items = renderedBy(MenuItems, {
      scrolling: defaultScrolling,
      items: [
        { label: 'a', onClick: () => log.push('a') },
        { label: 'sub', submenu: [{ label: 'x', onClick: noop }] },
      ],
      onClose: () => log.push('close'),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const [plain, sub] = items.props.children.map((entry) => {
      assert.ok(isValidElement<{ children: React.ReactNode[] }>(entry));
      const button = entry.props.children[0];
      assert.ok(
        isValidElement<{ onClick: (event: { detail: number }) => void }>(
          button,
        ),
      );
      return button;
    });
    plain.props.onClick({ detail: 1 });
    assert.deepStrictEqual(log, ['close', 'a']);
    sub.props.onClick({ detail: 1 });
    assert.deepStrictEqual(log, ['close', 'a']);
  });

  test("points to a submenu with the icon set's chevron, as the other icons are drawn, rather than a character of the font", () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[{ label: 'sub', submenu: [{ label: 'x', onClick: noop }] }]}
        onClose={noop}
      />,
    );
    assert.ok(
      html.includes(
        `<span class="submenu-arrow">${renderToStaticMarkup(<SubmenuIcon />)}</span>`,
      ),
    );
  });

  test('runs the item of the access key pressed, as the drive of its letter, closing the menu', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const log: string[] = [];
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await act(async () => {
        root.render(
          <div className="menu" onKeyDown={(event) => onMenuKeyDown(event)}>
            <MenuItems
              scrolling={defaultScrolling}
              items={[
                { label: 'C:', accessKey: 'C', onClick: () => log.push('C') },
                { label: 'D:', accessKey: 'D', onClick: () => log.push('D') },
              ]}
              onClose={() => log.push('close')}
            />
          </div>,
        );
      });
      const [first] = main.querySelectorAll('.menu-item');
      assert.ok(first);
      await act(async () => {
        first.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', { key: 'd', bubbles: true }),
        );
        first.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', { key: 'z', bubbles: true }),
        );
      });
      assert.deepStrictEqual(log, ['close', 'D']);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('keeps the item whose submenu is open marked while the focus is in the submenu, as Windows menus do', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
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
        root.render(
          <MenuItems
            scrolling={defaultScrolling}
            items={[
              { label: 'plain', onClick: noop },
              { label: 'sub', submenu: [{ label: 'x', onClick: noop }] },
            ]}
            onClose={noop}
          />,
        );
      });
      const [plain, parent] = main.querySelectorAll('.menu-item');
      assert.ok(plain && parent);
      assert.strictEqual(plain.getAttribute('aria-expanded'), null);
      assert.strictEqual(parent.getAttribute('aria-expanded'), 'false');
      await act(async () => {
        parent.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true, detail: 0 }),
        );
      });
      const opened = main.querySelector('.submenu .menu-item');
      assert.strictEqual(dom.window.document.activeElement, opened);
      assert.strictEqual(parent.getAttribute('aria-expanded'), 'true');
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('takes the focus to the item under the pointer without scrolling the menu, so a menu gliding under a pointer at rest goes on to where it was going', () => {
    const items = renderedBy(MenuItems, {
      scrolling: defaultScrolling,
      items: [{ label: 'a', onClick: noop }],
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const [entry] = items.props.children;
    assert.ok(isValidElement<{ children: React.ReactNode[] }>(entry));
    const [button] = entry.props.children;
    assert.ok(
      isValidElement<{
        onMouseMove: (event: {
          currentTarget: { focus: (options?: FocusOptions) => void };
        }) => void;
      }>(button),
    );
    const focused: (FocusOptions | undefined)[] = [];
    const saved = Reflect.get(globalThis, 'document');
    Object.assign(globalThis, { document: { activeElement: null } });
    try {
      button.props.onMouseMove({
        currentTarget: { focus: (options) => focused.push(options) },
      });
    } finally {
      Object.assign(globalThis, { document: saved });
    }
    assert.deepStrictEqual(focused, [{ preventScroll: true }]);
  });

  test('removes an item by its X or the Delete key, without running it or closing the menu, and keeps the focus in the menu', () => {
    const log: string[] = [];
    const items = renderedBy(MenuItems, {
      scrolling: defaultScrolling,
      items: [
        {
          label: 'a',
          onClick: () => log.push('a'),
          onRemove: () => log.push('remove'),
          removeTitle: 'Remove a',
        },
      ],
      onClose: () => log.push('close'),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const [entry] = items.props.children;
    assert.ok(isValidElement<{ children: React.ReactNode[] }>(entry));
    const [button, remove] = entry.props.children;
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
        onMouseDown: (event: { preventDefault: () => void }) => void;
        title: string;
      }>(remove),
    );
    assert.strictEqual(remove.props.title, 'Remove a');
    remove.props.onMouseDown({ preventDefault: () => log.push('kept focus') });
    remove.props.onClick({ stopPropagation: () => log.push('kept to itself') });
    assert.ok(
      isValidElement<{
        onKeyDown: (
          event: ReturnType<typeof keyPress> & { preventDefault: () => void },
        ) => void;
      }>(button),
    );
    button.props.onKeyDown({ ...keyPress('Delete'), preventDefault: noop });
    button.props.onKeyDown({ ...keyPress('a'), preventDefault: noop });
    assert.deepStrictEqual(log, [
      'kept focus',
      'kept to itself',
      'remove',
      'remove',
    ]);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <MenuItems
          scrolling={defaultScrolling}
          items={[{ label: 'b', onClick: noop }]}
          onClose={noop}
        />,
      ),
      /menu-remove/,
    );
  });

  test('marks the items that are on with a check', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[
          { label: 'main', checked: true, onClick: noop },
          { label: 'Collapse', checked: false, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(
      html,
      /role="menuitemcheckbox" aria-checked="true"><span class="menu-check">✓<\/span>main/,
    );
    assert.match(
      html,
      /role="menuitemcheckbox" aria-checked="false"><span class="menu-check"><\/span>Collapse/,
    );
  });

  test('shows the access key of an item before its label when asked, telling assistive technology it as the key of the item rather than reading it with the label, and hides it otherwise, as a drive letter is in its label already, leaving its room empty in a menu showing keys so the labels line up', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[
          {
            label: 'C:\\Code',
            accessKey: '1',
            showAccessKey: true,
            checked: true,
            onClick: noop,
          },
          { label: 'D:\\', accessKey: 'D', onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(
      html,
      /aria-keyshortcuts="1"[^>]*><span class="menu-check">✓<\/span><span class="menu-access-key" aria-hidden="true">1<\/span>C:\\Code<\/button>/,
    );
    assert.match(
      html,
      /data-access-key="D"><span class="menu-check"><\/span><span class="menu-access-key" aria-hidden="true"><\/span>D:\\<\/button>/,
    );
    assert.strictEqual(tagsWith(html, 'menu-access-key').length, 2);
  });

  test('leaves room for a check before every item, whether it can be checked or not, so the labels of every menu line up alike', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[
          { label: 'Open', onClick: noop },
          { separator: true },
          { label: 'Collapse', checked: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(
      html,
      /role="menuitem"><span class="menu-check"><\/span>Open<\/button>/,
    );
    assert.strictEqual(tagsWith(html, 'menu-check').length, 2);
    assert.strictEqual(tagsWith(html, 'menu-access-key').length, 0);
  });

  test('separates groups and greys out what cannot run', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        scrolling={defaultScrolling}
        items={[
          { label: 'Copy', onClick: noop },
          { separator: true },
          { label: 'Checkout', disabled: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.strictEqual(tagsWith(html, 'menu-separator').length, 1);
    assert.match(
      html,
      /role="menuitem"[^>]*disabled=""[^>]*><span class="menu-check"><\/span>Checkout/,
    );
  });
});
