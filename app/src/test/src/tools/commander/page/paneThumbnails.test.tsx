import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import { emptyView } from '../../../../../tools/commander/page/view';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../../tools/commander/page/store';
import { renderIn } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';

const filled = vi.hoisted((): unknown[] => []);
const starts = vi.hoisted((): (number | false)[] => []);

vi.mock(
  '../../../../../tools/commander/page/thumbnailFills',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../tools/commander/page/thumbnailFills')
    >()),
    useThumbnailFill: (
      items: unknown,
      start: number,
      _size: number,
      on: boolean,
    ) => {
      filled.push(items);
      starts.push(on && start);
    },
  }),
);

const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

function imagesPane(
  names: readonly string[] = ['a.png', 'b.png', 'c.png'],
): PaneView {
  const entries = names.map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 10,
    modified: 0,
  }));
  return {
    folder: '/pictures',
    hidden: [],
    entries,
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    sort,
    rows: rowsOf(entries, false, true, sort),
    selected: 'a.png',
    marked: new Set(),
    repositories: new Set(),
    counting: 0,
  };
}

suite('Commander thumbnails', () => {
  test('goes on filling the thumbnails of a side where it was as the cursor moves, rather than starting over at every row', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
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
          layouts: { left: 'thumbnails', right: 'details' },
          panes: { left: imagesPane(), right: undefined },
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
      const before = filled.length;
      const first = filled.at(-1);
      await act(async () => store.getState().select('left', 'b.png'));
      assert.ok(filled.length > before);
      assert.strictEqual(filled.at(-1), first);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('fills the thumbnails of each tab from where its tiles were scrolled to once it is shown again, rather than from where another tab was', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 2000,
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
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
      const names = Array.from(
        { length: 300 },
        (_, index) => `${1000 + index}.png`,
      );
      const store = createCommanderStore(noop, {
        view: {
          ...emptyView,
          tab: '1',
          active: 'left',
          layouts: { left: 'thumbnails', right: 'details' },
          panes: { left: imagesPane(names), right: undefined },
        },
      });
      store.getState().keepScroll('1 left /pictures thumbnails', 1000);
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
      assert.ok(
        !starts.includes(0),
        'no fill from the top of a tab scrolled down',
      );
      starts.length = 0;
      await act(async () => {
        store.getState().receive({ type: 'show', tab: '2' });
        store.getState().receive({
          type: 'listing',
          tab: '2',
          side: 'left',
          folder: '/pictures',
          hidden: [],
          entries: imagesPane(names).entries,
          parent: true,
          back: false,
          forward: false,
          elevated: false,
          selected: undefined,
        });
        store.getState().chooseLayout('left', 'thumbnails');
      });
      assert.strictEqual(
        starts.filter((start) => start !== false).at(-1),
        0,
        'the tab never scrolled filled from its top',
      );
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
