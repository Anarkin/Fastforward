import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createShellStore } from '../../../../../shell/page/store';
import {
  flatRowOf,
  parentRow,
  rowsOf,
} from '../../../../../tools/commander/page/listing';
import { emptyView } from '../../../../../tools/commander/page/view';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import type {
  CommanderToHost,
  CommanderToWebview,
  FlatProgress,
} from '../../../../../tools/commander/shared/protocol';
import type { ToHost } from '../../../../../shell/shared/protocol';
import type { Layout } from '../../../../../tools/commander/page/layouts';
import { withStores } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import {
  checkSize,
  checkStart,
  tileCheckSize,
  tileCheckStart,
} from '../../../../../tools/commander/page/lineCheck';
import { fixtureLine } from './listMock';
import { shownRowsOf } from '../../../../../tools/commander/page/shownRows';
import {
  tileColumns,
  tileWidthOf,
} from '../../../../../tools/commander/page/tiles';

interface Place {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly relatedTarget?: EventTarget | null;
  readonly shiftKey?: boolean;
}

export const pane = (
  elevated: boolean,
  hidden: readonly boolean[],
): PaneView => ({
  folder: 'C:\\Config.Msi',
  hidden,
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated,
  sort: { column: 'extension', descending: false, groupByColor: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
  repositories: new Set(),
  counting: 0,
});

const file = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

export const progress = (extra: Partial<FlatProgress> = {}): FlatProgress => ({
  reading: false,
  stopped: false,
  folders: 2,
  failed: 0,
  ...extra,
});

export const flatPane = (
  folder: string,
  flat: FlatProgress | undefined,
  selected?: string,
): PaneView => {
  return {
    ...pane(false, []),
    folder,
    selected,
    rows: [
      parentRow,
      flatRowOf(file('a.txt'), ''),
      flatRowOf(file('b.txt'), 'sub\\'),
    ],
    ...(flat !== undefined && {
      flat: { walk: 1, progress: flat, shown: undefined },
    }),
  };
};

export const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

export function workPane(): PaneView {
  const entries = [
    { name: 'app', folder: true },
    { name: 'docs', folder: true },
    { name: 'notes.txt', folder: false },
  ].map((each) => ({
    ...each,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  }));
  const repositories = new Set(['app']);
  return {
    folder: '/work',
    hidden: [],
    entries,
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    sort,
    rows: rowsOf(entries, true, true, sort, repositories),
    selected: 'notes.txt',
    marked: new Set(),
    repositories,
    counting: 0,
  };
}

const shown: { keys: readonly string[]; across: number; width: number } = {
  keys: [],
  across: 1,
  width: 1,
};

function aimed(target: Element, at: Place): [Element, Place] {
  const line = target.getAttribute('data-line');
  const tile = target.getAttribute('data-tile');
  const list = target.closest('[data-list]');
  if (tile !== null && list !== null) {
    const index = Number(tile);
    const boxed = target.hasAttribute('data-box');
    return [
      list,
      {
        ...at,
        clientX:
          (index % shown.across) * shown.width +
          (at.clientX ?? (boxed ? tileCheckStart + tileCheckSize / 2 : 40)),
        clientY:
          Math.floor(index / shown.across) * fixtureLine +
          (at.clientY ?? (boxed ? tileCheckStart + tileCheckSize / 2 : 2)),
      },
    ];
  }
  return line === null || list === null
    ? [target, at]
    : [
        list,
        {
          ...at,
          clientX: at.clientX ?? 100,
          clientY: Number(line) * fixtureLine + (at.clientY ?? fixtureLine / 2),
        },
      ];
}

export async function inSide(
  element: React.ReactNode,
  run: (shown: {
    readonly main: HTMLElement;
    readonly rightClick: (target: Element | null, shift?: boolean) => void;
    readonly click: (target: Element | null, count: number, at?: Place) => void;
    readonly point: (target: Element | null, type: string, at?: Place) => void;
    readonly menu: () => readonly string[];
    readonly choose: (label: string) => void;
    readonly posted: CommanderToHost[];
    readonly copied: () => readonly string[];
    readonly goingTo: () => string | undefined;
    readonly selected: () => string | undefined;
    readonly marked: () => readonly string[];
    readonly receive: (message: CommanderToWebview) => void;
  }) => Promise<void>,
  layout: Layout = 'details',
  shownPane: PaneView = workPane(),
) {
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
    Node: dom.window.Node,
    matchMedia: dom.window.matchMedia,
    devicePixelRatio: 1,
    requestAnimationFrame: (step: (time: number) => void) =>
      setTimeout(() => step(performance.now()), 0),
    cancelAnimationFrame: (frame: ReturnType<typeof setTimeout>) =>
      clearTimeout(frame),
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
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
    get: () => 800,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
    get: () => 600,
  });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function (
    this: HTMLElement,
  ) {
    return this.classList.contains('commander-ruler')
      ? new dom.window.DOMRect(0, 0, 800, fixtureLine)
      : new dom.window.DOMRect(0, 0, 0, 0);
  };
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: CommanderToHost[] = [];
    const commander = createCommanderStore((message) => posted.push(message), {
      drives: ['C:\\', 'D:\\'],
      view: {
        ...emptyView,
        tab: '1',
        active: 'left',
        platform: 'win32',
        bookmarks: ['/work/docs'],
        layouts: { left: layout, right: 'details' },
        panes: { left: shownPane, right: undefined },
      },
    });
    const shellPosted: ToHost[] = [];
    const shell = createShellStore((message) => shellPosted.push(message));
    await act(async () => {
      root.render(withStores(element, { shell, commander }));
    });
    const state = commander.getState();
    shown.keys = shownRowsOf(state, 'left').rows.map((row) => row.key);
    shown.width = tileWidthOf(state.view.thumbnailSize);
    shown.across = tileColumns(800, shown.width);
    const items = () =>
      (shell.getState().menu?.menu.items ?? []).flatMap((item) =>
        'separator' in item || item.disabled === true ? [] : [item],
      );
    await run({
      main,
      rightClick: (target, shift = false) => {
        assert.ok(target);
        const [into, at] = target.hasAttribute('data-line')
          ? aimed(target, { clientX: 10 })
          : [target, { clientX: 10, clientY: 20 }];
        act(() => {
          into.dispatchEvent(
            new dom.window.MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              ...at,
              shiftKey: shift,
            }),
          );
        });
      },
      click: (target, count, place = {}) => {
        assert.ok(target);
        const [into, at] = aimed(target, place);
        act(() => {
          for (const type of count === 2 ? ['click', 'dblclick'] : ['click']) {
            into.dispatchEvent(
              new dom.window.MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                detail: count,
                ...at,
              }),
            );
          }
        });
      },
      point: (target, type, place = {}) => {
        assert.ok(target);
        const [into, at] = aimed(target, place);
        act(() => {
          into.dispatchEvent(
            new dom.window.MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              ...at,
            }),
          );
        });
      },
      menu: () => items().map((item) => item.label),
      choose: (label) => {
        const item = items().find((each) => each.label === label);
        assert.ok(item, label);
        act(() => item.onClick?.());
      },
      posted,
      copied: () =>
        shellPosted.flatMap((message) =>
          message.type === 'copyText' ? [message.text] : [],
        ),
      goingTo: () => commander.getState().goingTo?.folder,
      selected: () => commander.getState().view.panes.left?.selected,
      marked: () => [...(commander.getState().view.panes.left?.marked ?? [])],
      receive: (message) => {
        act(() => commander.getState().receive(message));
      },
    });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

export const rowNamed = (main: HTMLElement, name: string) =>
  [...main.querySelectorAll('[data-line]')].find((line) => {
    const key = line.getAttribute('data-key') ?? '';
    return key === name || key.startsWith(`${name}.`);
  }) ?? null;

const tileMarkerIn = (list: Element | null, index: number, box: boolean) => {
  const marker = (list?.ownerDocument ?? document).createElement('span');
  marker.setAttribute('data-tile', String(index));
  marker.toggleAttribute('data-box', box);
  list?.append(marker);
  return marker;
};

export const tileNamed = (main: HTMLElement, name: string) => {
  const index = shown.keys.findIndex(
    (key) => key === name || key.startsWith(`${name}.`),
  );
  return index === -1
    ? null
    : tileMarkerIn(main.querySelector('[data-list]'), index, false);
};

export const boxOf = (item: Element | null) => {
  const tile = item?.getAttribute('data-tile');
  return item === null || tile === null || tile === undefined
    ? null
    : shown.keys[Number(tile)] === '..'
      ? null
      : tileMarkerIn(item.parentElement, Number(tile), true);
};

export const onBox: Place = { clientX: checkStart + checkSize / 2 };

export const pastBox: Place = { clientX: checkStart + checkSize };
