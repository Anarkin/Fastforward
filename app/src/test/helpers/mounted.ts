import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';

export async function mounted(
  element: React.ReactElement,
  check: (main: HTMLElement, window: JSDOM['window']) => void,
): Promise<void> {
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
    check(main, dom.window);
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

export function clicked(button: Element | null | undefined): void {
  assert.ok(button instanceof window.HTMLElement);
  act(() => button.click());
}

export function typed(input: Element | null | undefined, value: string): void {
  assert.ok(input instanceof window.HTMLInputElement);
  act(() => {
    Reflect.set(window.HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
