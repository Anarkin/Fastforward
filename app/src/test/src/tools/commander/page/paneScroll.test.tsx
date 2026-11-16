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

const started = vi.hoisted((): (number | undefined)[] => []);
const placed = vi.hoisted(
  (): {
    readonly placeKey?: string;
    readonly initialOffset?: number;
    readonly revealAtStart?: boolean;
  }[] => [],
);

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { useState } = await import('react');
  return {
    ...(await importOriginal<
      typeof import('../../../../../lib/page/virtualRows')
    >()),
    VirtualRows: ({
      initialOffset,
      placeKey,
      revealAtStart,
    }: {
      initialOffset?: number;
      placeKey?: string;
      revealAtStart?: boolean;
    }) => {
      useState(() => started.push(initialOffset));
      placed.push({ placeKey, initialOffset, revealAtStart });
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

async function inPage(
  run: (root: import('react-dom/client').Root) => Promise<void>,
): Promise<void> {
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
    await run(root);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

const leftPane = (
  store: ReturnType<typeof createCommanderStore>,
): React.ReactElement => (
  <CommanderStore value={store}>
    <Pane
      side="left"
      driveTrigger={null}
      bookmarkTrigger={null}
      resizer={null}
    />
  </CommanderStore>
);

suite('Commander scroll', () => {
  test('starts the list of a side shown before its folder is listed at the place its tab kept, once the folder comes back as its tab kept it, without revealing a selected row away from it, as a window reloaded came back with a side at its top', () =>
    inPage(async (root) => {
      placed.length = 0;
      const store = createCommanderStore(noop, {
        view: {
          ...emptyView,
          tab: '1',
          active: 'right',
          panes: { left: undefined, right: undefined },
        },
      });
      store.getState().keepScroll('1 left /work details', 300);
      await act(async () => renderIn(root, leftPane(store)));
      await act(async () => {
        store.setState({
          view: {
            ...store.getState().view,
            panes: {
              left: { ...workPane(), selected: 'a.txt', restored: true },
              right: undefined,
            },
          },
        });
      });
      assert.deepStrictEqual(placed.at(-1), {
        placeKey: '1 left /work details',
        initialOffset: 300,
        revealAtStart: false,
      });
    }));

  test('reveals the selected row of a folder a side goes to, at the place the side was left in it', () =>
    inPage(async (root) => {
      placed.length = 0;
      const store = createCommanderStore(noop, {
        view: {
          ...emptyView,
          tab: '1',
          active: 'left',
          panes: { left: workPane(), right: undefined },
        },
      });
      store.getState().keepScroll('1 left /work details', 300);
      await act(async () => renderIn(root, leftPane(store)));
      assert.deepStrictEqual(placed.at(-1), {
        placeKey: '1 left /work details',
        initialOffset: 300,
        revealAtStart: true,
      });
    }));

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
      started.length = 0;
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
