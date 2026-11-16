import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, createElement, type ReactNode } from 'react';
import { createShellStore, ShellStore } from '../../shell/page/store';
import type { ToHost } from '../../shell/shared/protocol';
import type {
  ToHostOf,
  ToolId,
  ToWebviewOfTool,
} from '../../shell/shared/tools';
import type { ToolViews } from '../../shell/page/toolViews';
import { terminalCells } from '../../lib/page/cellTable';
import { noop } from './fixtures';

const toolScreen = 10;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export interface ShownTool<K extends ToolId> {
  readonly window: JSDOM['window'];
  readonly document: Document;
  readonly posted: ToHostOf<K>[];
  readonly kept: ToHost[];
  readonly hand: (tab: string, view: string) => void;
  readonly send: (message: ToWebviewOfTool<K>) => Promise<void>;
  readonly shown: (active: boolean) => Promise<void>;
  readonly press: (
    key: string,
    modifiers?: { readonly ctrlKey?: boolean; readonly shiftKey?: boolean },
  ) => Promise<void>;
  readonly keyUp: (key: string) => Promise<void>;
  readonly type: (text: string) => Promise<void>;
  readonly click: (element: Element | null | undefined) => Promise<void>;
  readonly focus: (element: Element | null | undefined) => Promise<void>;
  readonly asked: <T extends ToHostOf<K>['type']>(
    type: T,
  ) => Extract<ToHostOf<K>, { type: T }>[];
  readonly answer: (asked: ToHostOf<K>) => void;
  readonly settle: () => Promise<void>;
}

export type Tool<K extends ToolId> = (props: {
  readonly active: boolean;
  readonly post: (message: ToHostOf<K>) => void;
  readonly listen: (
    handler: (message: ToWebviewOfTool<K>) => void,
  ) => () => void;
  readonly views?: ToolViews;
}) => ReactNode;

export async function inTool<K extends ToolId>(
  tool: K,
  shownTool: Tool<K>,
  run: (shown: ShownTool<K>) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = () =>
    Object.assign(new dom.window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: noop,
      removeListener: noop,
    });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('viewer-body') ? toolScreen : 0;
    },
  });
  const globals = {
    matchMedia: dom.window.matchMedia,
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getSelection: dom.window.getSelection.bind(dom.window),
    devicePixelRatio: 1,
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    const { createRoot } = await import('react-dom/client');
    await terminalCells();
    const { document } = dom.window;
    const main = document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: ToHostOf<K>[] = [];
    const answered = new Set<ToHostOf<K>>();
    let told: (message: ToWebviewOfTool<K>) => void = noop;
    const kept: ToHost[] = [];
    const shell = createShellStore((message) => kept.push(message));
    const draw = (active: boolean) =>
      root.render(
        createElement(
          ShellStore,
          { value: shell },
          createElement(shownTool, {
            active,
            post: (message: ToHostOf<K>) => posted.push(message),
            listen: (handler: (message: ToWebviewOfTool<K>) => void) => {
              told = handler;
              return noop;
            },
            views: shell.getState().channels[tool].views,
          }),
        ),
      );
    await act(async () => draw(true));
    const send = (message: ToWebviewOfTool<K>) =>
      act(async () => told(message));
    const unanswered = <T extends ToHostOf<K>['type']>(type: T) =>
      posted.filter(
        (message): message is Extract<ToHostOf<K>, { type: T }> =>
          message.type === type && !answered.has(message),
      );
    await settle();
    const running = run({
      window: dom.window,
      document,
      posted,
      kept,
      hand: (tab, view) =>
        shell.getState().receive({ type: 'view', tab, view }),
      send,
      shown: (active) => act(async () => draw(active)),
      press: (key, modifiers = {}) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...modifiers,
            }),
          );
        }),
      keyUp: (key) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keyup', { key, bubbles: true }),
          );
        }),
      type: (text) =>
        act(async () => {
          const field = document.activeElement;
          assert.ok(field instanceof dom.window.HTMLInputElement);
          Reflect.set(
            dom.window.HTMLInputElement.prototype,
            'value',
            text,
            field,
          );
          field.setSelectionRange(text.length, text.length);
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }),
      click: (element) =>
        act(async () => {
          element?.dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true }),
          );
        }),
      focus: (element) =>
        act(async () => {
          assert.ok(element instanceof dom.window.HTMLElement);
          element.focus();
        }),
      answer: (asked) => answered.add(asked),
      asked: unanswered,
      settle,
    });
    try {
      await running;
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }
}
