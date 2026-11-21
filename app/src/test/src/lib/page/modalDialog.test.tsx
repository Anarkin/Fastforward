import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { AboutPopup } from '../../../../shell/page/aboutPopup';
import { dialogHoldsFocus } from '../../../../lib/page/modalDialog';
import { ShortcutsPopup } from '../../../../shell/page/shortcutsPopup';
import { createShellStore } from '../../../../shell/page/store';
import { withStores } from '../../../helpers/componentFixtures';
import { noop } from '../../../helpers/fixtures';
import { withStillMediaQueries } from '../../../helpers/mediaQueries';

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
  withStillMediaQueries(dom.window);
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
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

suite('Modal dialogs', () => {
  test('move by dragging their header but not its close button, closing only by it or Escape, not by a click outside or the window losing focus, and a click on the backdrop leaving the keyboard with it', async () => {
    await inPage(async ({ document, before, shell, show }) => {
      const window = document.defaultView;
      assert.ok(window);
      for (const [shown, popup] of [
        [<AboutPopup key="about" />, 'about'],
        [<ShortcutsPopup key="shortcuts" />, 'shortcuts'],
      ] as const) {
        shell.getState().showPopup(popup, true);
        const open = () => shell.getState().popups.includes(popup);
        await show(shown);
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        const header = dialog?.querySelector('.shortcuts-title');
        const close = header?.querySelector('button');
        assert.ok(dialog && header && close);
        const pointer = (
          type: string,
          target: EventTarget,
          clientX: number,
          clientY: number,
          buttons = 0,
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
        await pointer('pointerdown', close, 10, 10, 1);
        await pointer('pointermove', window, 50, 50, 1);
        await pointer('pointerup', window, 50, 50);
        assert.strictEqual(dialog.style.left, '');
        await pointer('pointerdown', header, 10, 10, 1);
        await pointer('pointermove', window, 60, 50, 1);
        await pointer('pointerup', window, 60, 50);
        await pointer('pointermove', window, 90, 90);
        assert.deepStrictEqual(
          [dialog.style.position, dialog.style.left, dialog.style.top],
          ['fixed', '50px', '40px'],
        );
        const backdrop = dialog.parentElement;
        assert.ok(backdrop);
        assert.ok(backdrop.classList.contains('backdrop'));
        const press = new window.MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
        });
        backdrop.dispatchEvent(press);
        assert.strictEqual(press.defaultPrevented, true);
        await pointer('pointerdown', before, 0, 0);
        await act(async () => {
          window.dispatchEvent(new window.Event('blur'));
        });
        assert.ok(open());
        await act(async () => {
          window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Escape' }),
          );
        });
        assert.ok(!open());
        await show(null);
      }
    });
  });

  test('take the keyboard as they open, on their default button or their field, telling assistive technology the app behind waits, and give it back as they close', async () => {
    await inPage(async ({ document, before, show }) => {
      for (const [popup, focused] of [
        [<AboutPopup key="about" />, '.about-copy'],
        [<ShortcutsPopup key="shortcuts" />, '.shortcuts-filter input'],
      ] as const) {
        await show(popup);
        const dialog = document.querySelector('[role="dialog"]');
        assert.ok(dialog);
        assert.ok(document.activeElement === document.querySelector(focused));
        assert.strictEqual(dialog.getAttribute('aria-modal'), 'true');
        await show(null);
        assert.ok(document.activeElement === before);
      }
    });
  });

  test('keep Tab and Shift+Tab among their own controls, going round from the last to the first and back', async () => {
    await inPage(async ({ document, show, press }) => {
      await show(<AboutPopup />);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      assert.ok(dialog);
      const stops = Array.from(
        dialog.querySelectorAll<HTMLElement>('button, a'),
      );
      const first = stops[0];
      const last = stops.at(-1);
      assert.ok(first && last && stops.length === 3);
      dialog.focus();
      assert.strictEqual(press(dialog, true), false);
      assert.ok(document.activeElement === last);
      assert.strictEqual(press(last), false);
      assert.ok(document.activeElement === first);
      assert.strictEqual(press(first, true), false);
      assert.ok(document.activeElement === last);
      stops[1]?.focus();
      assert.strictEqual(press(stops[1]), true);
      assert.strictEqual(press(stops[1], true), true);
    });
  });

  test('tell when one holds the keyboard, so a view that opens behind it, as a new terminal, leaves the keyboard with it', () => {
    const { document } = new JSDOM(
      '<!doctype html><div role="dialog" tabindex="-1"><button>OK</button></div><textarea></textarea>',
    ).window;
    const button = document.querySelector('button');
    const textarea = document.querySelector('textarea');
    assert.ok(button && textarea);
    assert.strictEqual(dialogHoldsFocus(document), false);
    button.focus();
    assert.strictEqual(dialogHoldsFocus(document), true);
    textarea.focus();
    assert.strictEqual(dialogHoldsFocus(document), false);
  });
});
