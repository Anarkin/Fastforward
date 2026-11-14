import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import {
  emptyView,
  type PaneView,
} from '../../../../../tools/commander/page/view';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../../tools/commander/page/store';
import { renderIn } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';

const started = vi.hoisted((): (number | undefined)[] => []);

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { useState } = await import('react');
  return {
    ...(await importOriginal<
      typeof import('../../../../../lib/page/virtualRows')
    >()),
    VirtualRows: ({ initialOffset }: { initialOffset?: number }) => {
      useState(() => started.push(initialOffset));
      return null;
    },
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

suite('Commander scroll', () => {
  test('starts the list of a side where it was left in the tab shown, as two commander tabs showing the same folder each keep their own place', async () => {
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
      store.getState().keepScroll('1 left /work details', 300);
      store.getState().keepScroll('2 left /work details', 900);
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
      await act(async () => {
        store.setState({
          view: {
            ...store.getState().view,
            tab: '2',
            panes: { left: workPane(), right: undefined },
          },
        });
      });
      assert.deepStrictEqual(started, [300, 900]);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
