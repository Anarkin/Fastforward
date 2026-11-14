import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TabInfo } from '../../../../shell/shared/protocol';
import type { ToolId } from '../../../../shell/shared/tools';
import { setKeyPlatform } from '../../../../lib/shared/keymap';
import { shownEntries } from '../../../../shell/page/shortcutsPopup';
import { ShortcutsPopup } from '../../../../shell/page/shortcutsPopup';
import { shortcutEntries } from '../../../../shell/page/tools';
import { createShellStore } from '../../../../shell/page/store';
import { withStores } from '../../../helpers/componentFixtures';
import { noop } from '../../../helpers/fixtures';

export function shortcutsStore(
  tool?: ToolId,
  kind: Pick<TabInfo, 'view' | 'edit' | 'compare'> = {},
) {
  return createShellStore(noop, {
    popups: ['shortcuts'],
    ...(tool === undefined
      ? {}
      : { tabs: [{ id: '1', tool, name: 'repo', ...kind }], active: '1' }),
  });
}

export function shortcutsMarkup(
  tool?: ToolId,
  kind?: Pick<TabInfo, 'view' | 'edit' | 'compare'>,
): string {
  return renderToStaticMarkup(
    withStores(<ShortcutsPopup />, { shell: shortcutsStore(tool, kind) }),
  );
}

export const textsOf = (html: string, name: string) =>
  [
    ...html.matchAll(
      new RegExp(
        `class="${name}(?: [^"]*)?"[^>]*>(?:<svg.*?</svg>)?([^<]*)<`,
        'g',
      ),
    ),
  ].map((match) => match[1]);

export const entry = (id: string) => {
  const found = shortcutEntries.find((each) => each.id === id);
  assert.ok(found, id);
  return found;
};

export const contents = (id: string) =>
  entry(id).groups.map((group) => [
    group.title,
    group.bindings.map((binding) => binding.action),
  ]);

export const shown = (query: string) => shownEntries(shortcutEntries, query);

export function onMac<T>(draw: () => T): T {
  setKeyPlatform('darwin');
  try {
    return draw();
  } finally {
    setKeyPlatform('win32');
  }
}

export const view = (first: string | undefined, more = {}) => ({
  first,
  cut: false,
  atStart: false,
  atEnd: false,
  ...more,
});

export interface Held {
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
}

export async function inPopup(
  tool: ToolId,
  check: (page: {
    readonly document: Document;
    readonly press: (key: string, held?: Held) => Promise<void>;
    readonly type: (text: string) => Promise<void>;
  }) => Promise<void>,
  prepare: (document: Document) => void = () => {},
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
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
    const main = document.querySelector('main');
    assert.ok(main);
    prepare(document);
    const root = createRoot(main);
    await act(async () => {
      root.render(
        withStores(<ShortcutsPopup />, { shell: shortcutsStore(tool) }),
      );
    });
    const value = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    );
    await check({
      document,
      press: (key, held = {}) =>
        act(async () => {
          document.activeElement?.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...held,
            }),
          );
        }),
      type: (text) =>
        act(async () => {
          const field = document.querySelector('input');
          assert.ok(field);
          value?.set?.call(field, text);
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }),
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

export const openTool = (document: Document) =>
  document.querySelector('.shortcuts-tool.open .shortcuts-tool-name')
    ?.textContent;

export const headingsOf = (document: Document) =>
  [...document.querySelectorAll('.shortcuts-heading')].map(
    (heading) => heading.textContent,
  );
