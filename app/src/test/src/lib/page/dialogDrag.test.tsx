import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { AboutPopup } from '../../../../shell/page/aboutPopup';
import { draggedTo } from '../../../../lib/page/dialogDrag';
import { createShellStore } from '../../../../shell/page/store';
import { withStores } from '../../../helpers/componentFixtures';
import { noop } from '../../../helpers/fixtures';

const about = {
  version: '16.0.0',
  development: false,
  git: '2.56.0',
  system: 'Windows 11, build 26300, x64',
};

async function inPage(
  check: (page: {
    readonly document: Document;
    readonly before: HTMLElement;
    readonly shell: ReturnType<typeof createShellStore>;
    readonly show: (popup: React.ReactNode) => Promise<void>;
    readonly press: (target: Element, shiftKey?: boolean) => boolean;
  }) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM(
    '<!doctype html><button id="before">Before</button><main></main>',
  );
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    const before = document.querySelector<HTMLElement>('#before');
    const main = document.querySelector('main');
    assert.ok(before && main);
    before.focus();
    const root = createRoot(main);
    const shell = createShellStore(noop, { about });
    await check({
      document,
      before,
      shell,
      show: (popup) =>
        act(async () => {
          root.render(withStores(popup, { shell }));
        }),
      press: (target, shiftKey = false) =>
        target.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        ),
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Dragged dialogs', () => {
  test('move as far as the pointer, onto whole device pixels', () => {
    const view = { width: 1000, height: 800, ratio: 1.25 };
    const size = { width: 400, height: 300 };
    assert.deepStrictEqual(
      draggedTo({ x: 100, y: 100 }, { x: 10.3, y: -20.5 }, size, view),
      { x: 110.4, y: 79.2 },
    );
  });

  test('stay wholly within the window, sticking to its top left when larger than it', () => {
    const view = { width: 1000, height: 800, ratio: 1 };
    const size = { width: 400, height: 300 };
    assert.deepStrictEqual(
      draggedTo({ x: 100, y: 100 }, { x: -2000, y: -2000 }, size, view),
      { x: 0, y: 0 },
    );
    assert.deepStrictEqual(
      draggedTo({ x: 100, y: 100 }, { x: 2000, y: 2000 }, size, view),
      { x: 600, y: 500 },
    );
    assert.deepStrictEqual(
      draggedTo(
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { width: 1200, height: 900 },
        view,
      ),
      { x: 0, y: 0 },
    );
  });

  test('stop following the pointer once a drag ends where no button goes up, as when a touch is taken for a pan or the window loses the mouse', async () => {
    await inPage(async ({ document, show }) => {
      const window = document.defaultView;
      assert.ok(window);
      await show(<AboutPopup />);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const header = dialog?.querySelector('.shortcuts-title');
      assert.ok(dialog && header);
      const pointer = (
        type: string,
        target: EventTarget,
        clientX: number,
        clientY: number,
        buttons: number,
      ) =>
        act(async () => {
          target.dispatchEvent(
            new window.MouseEvent(type, {
              bubbles: true,
              button: 0,
              buttons,
              clientX,
              clientY,
            }),
          );
        });
      const place = () => [dialog.style.left, dialog.style.top];
      await pointer('pointerdown', header, 10, 10, 1);
      await pointer('pointermove', window, 30, 20, 1);
      await pointer('pointercancel', window, 30, 20, 0);
      await pointer('pointermove', window, 90, 90, 1);
      assert.deepStrictEqual(place(), ['20px', '10px']);
      await pointer('pointerdown', header, 10, 10, 1);
      await pointer('pointermove', window, 40, 30, 1);
      await pointer('pointermove', window, 90, 90, 0);
      await pointer('pointermove', window, 90, 90, 1);
      assert.deepStrictEqual(place(), ['30px', '20px']);
    });
  });
});
