import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../tools/commander/page/listing';
import {
  emptyView,
  type PaneView,
} from '../../../../tools/commander/page/view';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../tools/commander/page/store';
import { columnFocusAttribute } from '../../../../ui/columnFocus';
import { renderIn } from '../../../componentFixtures';
import { noop } from '../../../fixtures';

vi.mock('../../../../ui/virtualRows', async (importOriginal) => {
  const { createElement } = await import('react');
  return {
    ...(await importOriginal<typeof import('../../../../ui/virtualRows')>()),
    VirtualRows: () =>
      createElement('div', { tabIndex: 0, 'data-column-focus': '' }),
  };
});

const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

function workPane(): PaneView {
  const entries = ['a.txt', 'b.txt'].map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  }));
  return {
    folder: '/work',
    hidden: [],
    entries,
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    sort,
    rows: rowsOf(entries, true, true, sort),
    selected: '..',
    marked: new Set(),
    repositories: new Set(),
    counting: 0,
  };
}

suite('Commander focus', () => {
  test('keeps the keyboard on the list of the active side once another commander tab is shown, as the list drawn anew left it on the page', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    dom.window.matchMedia = () =>
      Object.assign(new dom.window.EventTarget(), {
        matches: false,
        media: '',
        onchange: null,
        addListener: noop,
        removeListener: noop,
      });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      matchMedia: dom.window.matchMedia,
      devicePixelRatio: 1,
      ResizeObserver: class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
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
      const store = createCommanderStore(noop, {
        view: {
          ...emptyView,
          tab: '1',
          active: 'left',
          panes: { left: workPane(), right: undefined },
        },
      });
      await act(async () => {
        renderIn(
          root,
          <CommanderStore value={store}>
            <Pane
              side="left"
              driveTrigger={null}
              bookmarkTrigger={null}
              resizer={null}
            />
          </CommanderStore>,
        );
      });
      const list = () =>
        main.querySelector<HTMLElement>(`[${columnFocusAttribute}]`);
      list()?.focus();
      const first = list();
      assert.ok(first !== null && dom.window.document.activeElement === first);
      await act(async () => {
        store.setState({
          view: {
            ...store.getState().view,
            tab: '2',
            panes: { left: workPane(), right: undefined },
          },
        });
      });
      const second = list();
      assert.ok(second !== null && second !== first);
      assert.ok(
        dom.window.document.activeElement === second,
        dom.window.document.activeElement?.tagName,
      );
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
