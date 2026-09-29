import * as assert from 'node:assert';
import { listenForDismiss } from '../webview/contextMenu';

function keyDown(key: string): Event {
  return Object.assign(new Event('keydown', { cancelable: true }), { key });
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
  test('closes only the top one on Escape, keeping it from VS Code', () => {
    const window = new EventTarget();
    const popup = open(window);
    const menu = open(window);
    try {
      const escape = keyDown('Escape');
      window.dispatchEvent(escape);
      assert.strictEqual(menu.menu.closed, 1);
      assert.strictEqual(popup.menu.closed, 0);
      assert.strictEqual(escape.cancelBubble, true);

      menu.stop();
      window.dispatchEvent(keyDown('Escape'));
      assert.strictEqual(popup.menu.closed, 1);
    } finally {
      menu.stop();
      popup.stop();
    }
  });

  test('closes on a click outside, but not in what it ignores', () => {
    const window = new EventTarget();
    const { menu, stop } = open(window, { ignore: '.context-menu' });
    try {
      window.dispatchEvent(pointerDown(menu.element));
      window.dispatchEvent(pointerDown(element('context-menu')));
      assert.strictEqual(menu.closed, 0);
      window.dispatchEvent(pointerDown(element('elsewhere')));
      assert.strictEqual(menu.closed, 1);
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
});
