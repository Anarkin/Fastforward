import {
  emptyView,
  reduceView,
  type CommanderView,
  type ViewAction,
} from '../../../../../tools/commander/page/view';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import type { FileColor } from '../../../../../tools/commander/shared/settings';

export const entry = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
  ...extra,
});

export const listing = (
  folder: string,
  entries: readonly Entry[],
  extra: Partial<Extract<ViewAction, { type: 'listing' }>> = {},
): ViewAction => ({
  type: 'listing',
  tab: '1',
  side: 'left',
  folder,
  entries,
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  hidden: [],
  selected: undefined,
  ...extra,
});

export const run = (...actions: ViewAction[]): CommanderView =>
  actions.reduce(reduceView, emptyView);

export const shown = (view: CommanderView) => ({
  rows: view.panes.left?.rows.map((row) => row.key),
  selected: view.panes.left?.selected,
});

export const colors = { light: '#000', dark: '#fff' };

export const sortedBy = (
  left: 'name' | 'size',
  showHidden = true,
  {
    groupByColor = false,
    fileColors = [],
    bookmarks = [],
  }: {
    readonly groupByColor?: boolean;
    readonly fileColors?: readonly FileColor[];
    readonly bookmarks?: readonly string[];
  } = {},
): ViewAction => ({
  type: 'settings',
  showHidden,
  sort: {
    left: { column: left, descending: false, groupByColor },
    right: { column: 'extension', descending: false, groupByColor: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors,
  bookmarks,
});

export const folderEntry = (name: string) => entry(name, { folder: true });

export const repositoriesShown = (view: CommanderView) =>
  view.panes.left?.rows.filter((row) => row.repository).map((row) => row.key);

export const inRepository = (view: CommanderView) =>
  view.panes.left?.inRepository ?? false;

export const named = (
  names: readonly string[],
  extra: Partial<Extract<ViewAction, { type: 'repositories' }>> = {},
): ViewAction => ({
  type: 'repositories',
  tab: '1',
  side: 'left',
  folder: '/code',
  names,
  ...extra,
});

export const sized = (
  entries: readonly Entry[],
  extra: Partial<Extract<ViewAction, { type: 'folderSizes' }>> = {},
): ViewAction => ({
  type: 'folderSizes',
  tab: '1',
  side: 'left',
  folder: '/code',
  entries,
  ...extra,
});
