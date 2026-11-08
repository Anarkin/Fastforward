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
import { renderIn } from '../../../componentFixtures';
import { noop } from '../../../fixtures';

const filled = vi.hoisted((): unknown[] => []);

vi.mock('../../../../ui/thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/thumbnails')>()),
  useThumbnailFill: (items: unknown) => {
    filled.push(items);
  },
}));

const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

function imagesPane(): PaneView {
  const entries = ['a.png', 'b.png', 'c.png'].map((name) => ({
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
});
