import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { AboutPopup } from '../../shell/page/aboutPopup';
import { draggedTo } from '../../ui/modalDialog';
import { ShortcutsPopup } from '../../shell/page/shortcutsPopup';
import { noop } from '../fixtures';

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
    await check({
      document,
      before,
      show: (popup) =>
        act(async () => {
          root.render(popup);
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

  test('move by dragging their header but not its close button, closing only by it or Escape, not by a click outside or the window losing focus, and a click on the backdrop leaving the keyboard with it', async () => {
    await inPage(async ({ document, before, show }) => {
      const window = document.defaultView;
      assert.ok(window);
      for (const shown of [
        (onClose: () => void) => (
          <AboutPopup about={about} onCopy={noop} onClose={onClose} />
        ),
        (onClose: () => void) => (
          <ShortcutsPopup groups={[]} mac={false} onClose={onClose} />
        ),
      ]) {
        let closed = 0;
        await show(shown(() => closed++));
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        const header = dialog?.querySelector('.shortcuts-title');
        const close = header?.querySelector('button');
        assert.ok(dialog && header && close);
        const pointer = (
          type: string,
          target: EventTarget,
          clientX: number,
          clientY: number,
        ) =>
          act(async () => {
            target.dispatchEvent(
              new window.MouseEvent(type, {
                bubbles: true,
                button: 0,
                clientX,
                clientY,
              }),
            );
          });
        await pointer('pointerdown', close, 10, 10);
        await pointer('pointermove', window, 50, 50);
        await pointer('pointerup', window, 50, 50);
        assert.strictEqual(dialog.style.left, '');
        await pointer('pointerdown', header, 10, 10);
        await pointer('pointermove', window, 60, 50);
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
        assert.strictEqual(closed, 0);
        await act(async () => {
          window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Escape' }),
          );
        });
        assert.strictEqual(closed, 1);
        await show(null);
      }
    });
  });

  test('take the keyboard as they open, telling assistive technology the app behind waits, and give it back as they close', async () => {
    await inPage(async ({ document, before, show }) => {
      for (const popup of [
        <AboutPopup key="about" about={about} onCopy={noop} onClose={noop} />,
        <ShortcutsPopup
          groups={[]}
          key="shortcuts"
          mac={false}
          onClose={noop}
        />,
      ]) {
        await show(popup);
        const dialog = document.querySelector('[role="dialog"]');
        assert.ok(dialog);
        assert.ok(document.activeElement === dialog);
        assert.strictEqual(dialog.getAttribute('aria-modal'), 'true');
        await show(null);
        assert.ok(document.activeElement === before);
      }
    });
  });

  test('keep Tab and Shift+Tab among their own controls, going round from the last to the first and back', async () => {
    await inPage(async ({ document, show, press }) => {
      await show(<AboutPopup about={about} onCopy={noop} onClose={noop} />);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      assert.ok(dialog);
      const stops = Array.from(
        dialog.querySelectorAll<HTMLElement>('button, a'),
      );
      const first = stops[0];
      const last = stops.at(-1);
      assert.ok(first && last && stops.length === 3);
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
});
