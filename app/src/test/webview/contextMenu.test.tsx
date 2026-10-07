import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  claimsMenuKey,
  listenForDismiss,
  MenuItems,
  nextMenuItem,
  openedSubmenu,
  submenuPlacement,
} from '../../webview/contextMenu';
import { keyPress, noModifiers, noop, renderedBy, tagsWith } from '../fixtures';

function keyDown(key: string): Event {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    code: '',
    ...noModifiers,
  });
}

function pointerDown(target: object | null): Event {
  const event = new Event('pointerdown');
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function element(className: string) {
  const node = {
    nodeType: 1,
    className,
    contains: (other: unknown) => other === node,
    closest: (selector: string) => (selector === `.${className}` ? node : null),
  };
  return node;
}

function open(
  window: EventTarget,
  options: Parameters<typeof listenForDismiss>[3] = {},
) {
  const menu = { closed: 0, element: element('menu') };
  const stop = listenForDismiss(
    window,
    { current: menu.element },
    () => menu.closed++,
    options,
  );
  return { menu, stop };
}

suite('Dismissing menus and popups', () => {
  test('closes only the top one on Escape, keeping it from anything else', () => {
    const window = new EventTarget();
    const popup = open(window);
    const menu = open(window);
    try {
      window.dispatchEvent(keyDown('Enter'));
      assert.strictEqual(menu.menu.closed, 0);
      assert.strictEqual(popup.menu.closed, 0);

      const escape = keyDown('Escape');
      window.dispatchEvent(escape);
      assert.strictEqual(menu.menu.closed, 1);
      assert.strictEqual(popup.menu.closed, 0);
      assert.strictEqual(escape.cancelBubble, true);

      menu.stop();
      window.dispatchEvent(keyDown('Escape'));
      assert.strictEqual(popup.menu.closed, 1);
      assert.strictEqual(menu.menu.closed, 1);
    } finally {
      menu.stop();
      popup.stop();
    }
  });

  test('closes on a click outside, but not in what it ignores or on a scrollbar', () => {
    const window = new EventTarget();
    const { menu, stop } = open(window, { ignore: '.context-menu' });
    try {
      window.dispatchEvent(pointerDown(menu.element));
      window.dispatchEvent(pointerDown(element('context-menu')));
      window.dispatchEvent(pointerDown(element('overlay-scrollbar')));
      assert.strictEqual(menu.closed, 0);
      window.dispatchEvent(pointerDown(element('elsewhere')));
      assert.strictEqual(menu.closed, 1);
      window.dispatchEvent(pointerDown(null));
      assert.strictEqual(menu.closed, 2);
    } finally {
      stop();
    }
  });

  test('closes when the window loses focus, and on scrolling when asked', () => {
    const window = new EventTarget();
    const { menu, stop } = open(window);
    const scrolled = open(window, { onScroll: true });
    try {
      window.dispatchEvent(new Event('wheel'));
      assert.strictEqual(menu.closed, 0);
      assert.strictEqual(scrolled.menu.closed, 1);
      window.dispatchEvent(new Event('blur'));
      assert.strictEqual(menu.closed, 1);
    } finally {
      scrolled.stop();
      stop();
    }
  });

  test('stays open on scrolling inside it, so a long menu scrolls', () => {
    const window = new EventTarget();
    const { menu, stop } = open(window, { onScroll: true });
    try {
      const inside = new Event('wheel');
      Object.defineProperty(inside, 'target', { value: menu.element });
      window.dispatchEvent(inside);
      assert.strictEqual(menu.closed, 0);
    } finally {
      stop();
    }
  });

  test('closes nothing once stopped', () => {
    const window = new EventTarget();
    const { menu, stop } = open(window, { onScroll: true });
    stop();
    window.dispatchEvent(keyDown('Escape'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('wheel'));
    window.dispatchEvent(pointerDown(element('elsewhere')));
    assert.strictEqual(menu.closed, 0);
  });
});

suite('Menu keys', () => {
  test('moves through the items with the arrows, wrapping around, and to either end with Home and End', () => {
    assert.strictEqual(nextMenuItem('next', 0, 3), 1);
    assert.strictEqual(nextMenuItem('next', 2, 3), 0);
    assert.strictEqual(nextMenuItem('previous', 0, 3), 2);
    assert.strictEqual(nextMenuItem('previous', -1, 3), 2);
    assert.strictEqual(nextMenuItem('next', -1, 3), 0);
    assert.strictEqual(nextMenuItem('first', 2, 3), 0);
    assert.strictEqual(nextMenuItem('last', 0, 3), 2);
    assert.strictEqual(nextMenuItem('next', -1, 0), undefined);
  });

  test('keeps every arrow and Tab to itself, so none moves between the columns behind it', () => {
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowUp',
      'ArrowDown',
      'Tab',
    ]) {
      assert.ok(claimsMenuKey(keyPress(key)), key);
    }
    for (const key of ['Enter', 'a', 'Escape']) {
      assert.ok(!claimsMenuKey(keyPress(key)), key);
    }
  });
});

suite('Submenu placement', () => {
  const window = { width: 800, height: 600 };

  test('opens to the right and down from its entry when it fits', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 100, right: 700, bottom: 500 }, window),
      { flipped: false, up: 0 },
    );
  });

  test('opens to the left when it would run off the right of the window', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 100, right: 801, bottom: 500 }, window),
      { flipped: true, up: 0 },
    );
  });

  test('moves up to end at the bottom of the window when it would run off it', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 400, right: 700, bottom: 750 }, window),
      { flipped: false, up: 150 },
    );
  });

  test('moves up no further than the top of the window when taller than it', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 400, right: 700, bottom: 1100 }, window),
      { flipped: false, up: 400 },
    );
  });
});

suite('Menu items', () => {
  test('keys items apart that have the same label', () => {
    const items = renderedBy(MenuItems, {
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

  test('opens a submenu in place of running it, focusing its first item only on a click from the keyboard', () => {
    const submenu = [{ label: 'x', onClick: noop }];
    assert.deepStrictEqual(openedSubmenu({ submenu }, 0), {
      focusFirst: true,
    });
    assert.deepStrictEqual(openedSubmenu({ submenu }, 1), {
      focusFirst: false,
    });
    assert.strictEqual(openedSubmenu({}, 0), undefined);
  });

  test('marks the items that are on with a check', () => {
    const html = renderToStaticMarkup(
      <MenuItems
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

  test('separates groups and greys out what cannot run', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        items={[
          { label: 'Copy', onClick: noop },
          { separator: true },
          { label: 'Checkout', disabled: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.strictEqual(tagsWith(html, 'menu-separator').length, 1);
    assert.match(html, /role="menuitem"[^>]*disabled=""[^>]*>Checkout/);
  });
});
