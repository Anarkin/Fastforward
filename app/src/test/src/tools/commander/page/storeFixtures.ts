import type { CommanderToHost } from '../../../../../tools/commander/shared/protocol';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import {
  emptyView,
  type PaneView,
} from '../../../../../tools/commander/page/view';
import { noop } from '../../../../helpers/fixtures';

export const left: PaneView = {
  folder: 'C:\\code',
  hidden: [],
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  sort: { column: 'extension', descending: false, groupByColor: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
  repositories: new Set(),
  counting: 0,
};

export function shown() {
  const posted: CommanderToHost[] = [];
  const store = createCommanderStore((message) => posted.push(message), {
    view: { ...emptyView, tab: '1', panes: { left, right: undefined } },
  });
  return { posted, store };
}

export const listing = (folder: string, tab = '1') =>
  ({
    type: 'listing',
    tab,
    side: 'left',
    folder,
    hidden: [],
    entries: [],
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    selected: undefined,
  }) as const;

export const place = { page: 2, zoom: 'auto', left: 0, top: 10 } as const;

export const withFiles = (folder: string, ...names: string[]) => ({
  ...listing(folder),
  entries: names.map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  })),
});

export function byName() {
  return createCommanderStore(noop, {
    view: {
      ...emptyView,
      tab: '1',
      panes: {
        left: { ...left, sort: { ...left.sort, column: 'name' } },
        right: undefined,
      },
    },
  });
}

export const selectedOf = (store: ReturnType<typeof byName>) =>
  store.getState().view.panes.left?.selected;
