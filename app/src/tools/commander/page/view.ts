import {
  sides,
  type CommanderToWebviewOf,
  type Entry,
  type FlatProgress,
  type Side,
} from '../shared/protocol';
import {
  defaultLayouts,
  type ColumnWidths,
  type Layout,
  type Layouts,
  type Sort,
  type Sorts,
} from '../shared/settings';
import type { ViewMode } from '../shared/keymap';
import type { EncodingChoice } from './encodings';
import {
  filteredSelection,
  parentRow,
  rowsOf,
  selectionAfter,
  type Row,
  type Selection,
} from './listing';
import {
  fileColorsOf,
  noFileColors,
  sameGrouping,
  type FileColors,
} from './fileColors';

interface Listed {
  readonly folder: string;
  readonly hidden: readonly boolean[];
  readonly entries: readonly Entry[];
  readonly parent: boolean;
  readonly back: boolean;
  readonly forward: boolean;
  readonly elevated: boolean;
  readonly binOff?: true;
  readonly archive?: string;
}

interface FlatShown {
  readonly query: string;
  readonly rows: readonly Row[];
}

interface FlatView {
  readonly walk: number;
  readonly progress: FlatProgress;
  readonly shown: FlatShown | undefined;
}

interface DuplicatesView {
  readonly look: number;
  readonly groups: readonly (readonly string[])[];
  readonly reading: boolean;
}

function duplicatesOf(
  before: DuplicatesView | undefined,
  look: number | undefined,
): DuplicatesView | undefined {
  if (look === undefined) {
    return undefined;
  }
  return before?.look === look ? before : { look, groups: [], reading: true };
}

export interface PaneView extends Listed {
  readonly sort: Sort;
  readonly rows: readonly Row[];
  readonly selected: string | undefined;
  readonly marked: ReadonlySet<string>;
  readonly repositories: ReadonlySet<string>;
  readonly inRepository?: boolean;
  readonly flat?: FlatView;
  readonly duplicates?: DuplicatesView;
  readonly counting: number;
}

const startedReading: FlatProgress = {
  reading: true,
  stopped: false,
  folders: 0,
  failed: 0,
};

const noMarks: ReadonlySet<string> = new Set();

const noRepositories: ReadonlySet<string> = new Set();

function countingIn(entries: readonly Entry[]): number {
  return entries.reduce(
    (count, entry) => (entry.counting === true ? count + 1 : count),
    0,
  );
}

function repositoriesKept(
  pane: PaneView | undefined,
  folder: string,
): ReadonlySet<string> {
  return pane === undefined || pane.folder !== folder
    ? noRepositories
    : pane.repositories;
}

function marksKept(
  pane: PaneView | undefined,
  folder: string,
  rows: readonly Row[],
): ReadonlySet<string> {
  if (pane === undefined || pane.folder !== folder || pane.marked.size === 0) {
    return noMarks;
  }
  const present = new Set<string>();
  for (const row of rows) {
    if (pane.marked.has(row.key)) {
      present.add(row.key);
    }
  }
  return new Set([...pane.marked].filter((key) => present.has(key)));
}

export interface CommanderView {
  readonly tab: string | undefined;
  readonly viewing: string | undefined;
  readonly showHidden: boolean;
  readonly sorts: Sorts;
  readonly columns: ColumnWidths;
  readonly defaultColumns: ColumnWidths;
  readonly canElevate: boolean;
  readonly platform: string | undefined;
  readonly layouts: Layouts;
  readonly thumbnailSize: number;
  readonly fileColors: FileColors;
  readonly bookmarks: readonly string[];
  readonly active: Side;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
  readonly kept: ReadonlyMap<string, KeptTab>;
  readonly viewers: ReadonlyMap<string, ViewerChoices>;
  readonly closedTab: string | undefined;
}

export interface ViewerChoices {
  readonly mode?: ViewMode;
  readonly encoding?: EncodingChoice;
  readonly language?: string;
}

const noChoices: ViewerChoices = {};

export function viewerChoices(view: CommanderView): ViewerChoices {
  return view.tab === undefined
    ? noChoices
    : (view.viewers.get(view.tab) ?? noChoices);
}

function without<T>(
  kept: ReadonlyMap<string, T>,
  tab: string,
): ReadonlyMap<string, T> {
  if (!kept.has(tab)) {
    return kept;
  }
  const left = new Map(kept);
  left.delete(tab);
  return left;
}

interface KeptTab {
  readonly active: Side;
  readonly layouts: Layouts;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
}

function keptAway(view: CommanderView): ReadonlyMap<string, KeptTab> {
  if (
    view.tab === undefined ||
    view.viewing !== undefined ||
    view.tab === view.closedTab
  ) {
    return view.kept;
  }
  return new Map(view.kept).set(view.tab, {
    active: view.active,
    layouts: view.layouts,
    panes: view.panes,
  });
}

export const emptyView: CommanderView = {
  tab: undefined,
  viewing: undefined,
  showHidden: true,
  sorts: {
    left: { column: 'extension', descending: false, groupByColor: true },
    right: { column: 'extension', descending: false, groupByColor: true },
  },
  columns: { extension: 10, size: 17, date: 16 },
  defaultColumns: { extension: 10, size: 17, date: 16 },
  canElevate: false,
  platform: undefined,
  layouts: defaultLayouts,
  thumbnailSize: 144,
  fileColors: noFileColors,
  bookmarks: [],
  active: 'right',
  panes: { left: undefined, right: undefined },
  kept: new Map(),
  viewers: new Map(),
  closedTab: undefined,
};

export type ViewAction =
  | {
      readonly type: 'show';
      readonly tab: string;
      readonly file?: string;
    }
  | { readonly type: 'hide' }
  | CommanderToWebviewOf<'closed'>
  | { readonly type: 'choose'; readonly choices: Partial<ViewerChoices> }
  | (Omit<CommanderToWebviewOf<'settings'>, 'type'> & {
      readonly type: 'settings';
    })
  | (Omit<CommanderToWebviewOf<'listing'>, 'type'> & {
      readonly type: 'listing';
    })
  | (Omit<CommanderToWebviewOf<'repositories'>, 'type'> & {
      readonly type: 'repositories';
    })
  | CommanderToWebviewOf<'folderSizes'>
  | CommanderToWebviewOf<'duplicateGroups'>
  | {
      readonly type: 'flatRows';
      readonly tab: string;
      readonly side: Side;
      readonly walk: number;
      readonly rows: readonly Row[];
      readonly shown: FlatShown | undefined;
      readonly complete: boolean;
    }
  | {
      readonly type: 'flatProgress';
      readonly tab: string;
      readonly side: Side;
      readonly walk: number;
      readonly progress: FlatProgress;
    }
  | { readonly type: 'select'; readonly side: Side; readonly key: string }
  | {
      readonly type: 'mark';
      readonly side: Side;
      readonly keys: readonly string[];
      readonly marked: boolean;
    }
  | { readonly type: 'sort'; readonly side: Side; readonly sort: Sort }
  | { readonly type: 'layout'; readonly side: Side; readonly layout: Layout }
  | { readonly type: 'activate'; readonly side: Side }
  | { readonly type: 'switchSide' };

function selectionIn(pane: PaneView | undefined): Selection | undefined {
  return (
    pane && {
      folder: pane.folder,
      key: pane.selected,
      index: pane.rows.findIndex((row) => row.key === pane.selected),
    }
  );
}

function sameFolders(
  one: readonly string[],
  other: readonly string[],
): boolean {
  return (
    one.length === other.length &&
    one.every((folder, index) => folder === other[index])
  );
}

function sameSort(one: Sort, other: Sort): boolean {
  return (
    one.column === other.column &&
    one.descending === other.descending &&
    one.groupByColor === other.groupByColor
  );
}

function relisted(
  pane: PaneView | undefined,
  sort: Sort,
  {
    folder,
    hidden,
    entries,
    parent,
    back,
    forward,
    elevated,
    binOff,
    archive,
  }: Listed,
  showHidden: boolean,
  fileColors: FileColors,
  selected: string | undefined,
  sortedBefore?: PaneView,
): PaneView {
  const repositories = repositoriesKept(pane, folder);
  const rows = rowsOf(
    entries,
    parent,
    showHidden,
    sort,
    repositories,
    fileColors,
    sortedBefore,
  );
  return {
    folder,
    hidden,
    entries,
    parent,
    back,
    forward,
    elevated,
    ...(binOff && { binOff }),
    ...(archive !== undefined && { archive }),
    sort,
    rows,
    selected: selectionAfter(selectionIn(pane), folder, rows, selected),
    marked: marksKept(pane, folder, rows),
    repositories,
    inRepository: inRepositoryKept(pane, folder),
    ...(pane?.folder === folder &&
      pane.duplicates !== undefined && { duplicates: pane.duplicates }),
    counting: countingIn(entries),
  };
}

function inRepositoryKept(pane: PaneView | undefined, folder: string): boolean {
  return pane?.folder === folder && pane.inRepository === true;
}

function flatListed(
  pane: PaneView | undefined,
  sort: Sort,
  {
    folder,
    hidden,
    parent,
    back,
    forward,
    elevated,
    binOff,
    archive,
    selected,
    flat,
  }: Listed & { readonly selected: string | undefined; readonly flat: number },
): PaneView {
  const listed = {
    folder,
    hidden,
    entries: [],
    parent,
    back,
    forward,
    elevated,
    ...(binOff && { binOff }),
    ...(archive !== undefined && { archive }),
  };
  if (pane?.flat?.walk === flat && pane.folder === folder) {
    return {
      ...pane,
      ...listed,
      selected:
        selected !== undefined && pane.rows.some((row) => row.key === selected)
          ? selected
          : pane.selected,
    };
  }
  const rows = parent ? [parentRow] : [];
  const selectedFile =
    pane?.folder === folder
      ? pane.rows.find(
          (row) =>
            row.key === pane.selected &&
            row.entry !== undefined &&
            !row.entry.folder,
        )?.key
      : undefined;
  return {
    ...listed,
    sort,
    rows,
    selected:
      selectedFile ?? selectionAfter(selectionIn(pane), folder, rows, selected),
    marked: noMarks,
    repositories: noRepositories,
    inRepository: inRepositoryKept(pane, folder),
    flat: { walk: flat, progress: startedReading, shown: undefined },
    counting: 0,
  };
}

function flatSelection(
  pane: PaneView,
  rows: readonly Row[],
  shown: FlatShown | undefined,
  complete: boolean,
): string | undefined {
  const { selected } = pane;
  if (shown !== undefined) {
    return filteredSelection(shown.rows, selected);
  }
  if (selected !== undefined && rows.some((row) => row.key === selected)) {
    return selected;
  }
  const before = selectionIn(pane);
  if (before === undefined || before.index !== -1) {
    return selectionAfter(before, pane.folder, rows, undefined);
  }
  return pane.flat?.progress.reading === true || !complete
    ? selected
    : rows.at(0)?.key;
}

function folderOfSelected(pane: PaneView): string | undefined {
  const row = pane.rows.find((each) => each.key === pane.selected);
  const under = row?.under ?? '';
  return under === '' ? row?.key : under.slice(0, under.search(/[\\/]/));
}

function withFlatRows(
  pane: PaneView,
  rows: readonly Row[],
  shown: FlatShown | undefined,
  complete: boolean,
): PaneView {
  return {
    ...pane,
    rows,
    selected: flatSelection(pane, rows, shown, complete),
    marked: marksKept(pane, pane.folder, rows),
    flat: pane.flat && { ...pane.flat, shown },
  };
}

function withPane(
  view: CommanderView,
  side: Side,
  pane: PaneView,
): CommanderView {
  return { ...view, panes: { ...view.panes, [side]: pane } };
}

function settledPanes(
  view: CommanderView,
  { panes }: KeptTab,
): Readonly<Record<Side, PaneView | undefined>> {
  const settled = (side: Side) => {
    const pane = panes[side];
    if (pane?.flat !== undefined) {
      return { ...pane, sort: view.sorts[side] };
    }
    return (
      pane &&
      relisted(
        pane,
        view.sorts[side],
        pane,
        view.showHidden,
        view.fileColors,
        undefined,
      )
    );
  };
  return { left: settled('left'), right: settled('right') };
}

export function reduceView(
  view: CommanderView,
  action: ViewAction,
): CommanderView {
  switch (action.type) {
    case 'show': {
      if (view.tab === action.tab && view.closedTab !== action.tab) {
        return view;
      }
      const kept = keptAway(view);
      const back = kept.get(action.tab);
      return {
        ...view,
        tab: action.tab,
        viewing: action.file,
        active: back?.active ?? emptyView.active,
        layouts: back?.layouts ?? emptyView.layouts,
        panes: back === undefined ? emptyView.panes : settledPanes(view, back),
        kept,
        closedTab: undefined,
      };
    }
    case 'hide':
      return {
        ...view,
        tab: undefined,
        viewing: undefined,
        layouts: emptyView.layouts,
        panes: emptyView.panes,
        kept: keptAway(view),
        closedTab: undefined,
      };
    case 'closed':
      return {
        ...view,
        closedTab: view.tab === action.tab ? action.tab : view.closedTab,
        kept: without(view.kept, action.tab),
        viewers: without(view.viewers, action.tab),
      };
    case 'choose':
      return view.tab === undefined || view.viewing === undefined
        ? view
        : {
            ...view,
            viewers: new Map(view.viewers).set(view.tab, {
              ...viewerChoices(view),
              ...action.choices,
            }),
          };
    case 'settings': {
      const settled: CommanderView = {
        ...view,
        showHidden: action.showHidden,
        sorts: action.sort,
        columns: action.columns,
        defaultColumns: action.defaultColumns,
        canElevate: action.canElevate,
        platform: action.platform,
        thumbnailSize: action.thumbnailSize,
        fileColors: fileColorsOf(action.fileColors),
        bookmarks: sameFolders(view.bookmarks, action.bookmarks)
          ? view.bookmarks
          : action.bookmarks,
      };
      const regrouped = !sameGrouping(view.fileColors, settled.fileColors);
      return sides.reduce((next, side) => {
        const pane = view.panes[side];
        const sort = action.sort[side];
        return pane &&
          (action.showHidden !== view.showHidden ||
            !sameSort(pane.sort, sort) ||
            (sort.groupByColor && regrouped))
          ? withPane(
              next,
              side,
              pane.flat === undefined
                ? relisted(
                    pane,
                    sort,
                    pane,
                    action.showHidden,
                    settled.fileColors,
                    undefined,
                  )
                : { ...pane, sort },
            )
          : next;
      }, settled);
    }
    case 'listing': {
      const pane = view.panes[action.side];
      if (action.tab !== view.tab) {
        return view;
      }
      const sort = pane?.sort ?? view.sorts[action.side];
      const { flat } = action;
      const leftFlat =
        pane?.flat !== undefined && pane.folder === action.folder
          ? folderOfSelected(pane)
          : undefined;
      const listed =
        flat === undefined
          ? relisted(
              pane,
              sort,
              action,
              view.showHidden,
              view.fileColors,
              action.selected ?? leftFlat,
              pane?.folder === action.folder && pane.flat === undefined
                ? pane
                : undefined,
            )
          : flatListed(pane, sort, { ...action, flat });
      const duplicates = duplicatesOf(
        pane?.folder === action.folder ? pane.duplicates : undefined,
        action.duplicates,
      );
      const { duplicates: _left, ...withoutDuplicates } = listed;
      return withPane(
        view,
        action.side,
        duplicates === undefined
          ? withoutDuplicates
          : { ...withoutDuplicates, duplicates },
      );
    }
    case 'duplicateGroups': {
      const pane = view.panes[action.side];
      return action.tab === view.tab &&
        pane?.folder === action.folder &&
        pane.duplicates?.look === action.look
        ? withPane(view, action.side, {
            ...pane,
            duplicates: {
              look: action.look,
              groups: action.groups,
              reading: action.reading,
            },
          })
        : view;
    }
    case 'flatRows': {
      const pane = view.panes[action.side];
      return action.tab === view.tab &&
        pane?.flat !== undefined &&
        pane.flat.walk === action.walk
        ? withPane(
            view,
            action.side,
            withFlatRows(pane, action.rows, action.shown, action.complete),
          )
        : view;
    }
    case 'flatProgress': {
      const pane = view.panes[action.side];
      return action.tab === view.tab &&
        pane?.flat !== undefined &&
        pane.flat.walk === action.walk
        ? withPane(view, action.side, {
            ...pane,
            flat: { ...pane.flat, progress: action.progress },
          })
        : view;
    }
    case 'repositories': {
      const pane = view.panes[action.side];
      if (
        action.tab !== view.tab ||
        pane === undefined ||
        pane.folder !== action.folder ||
        pane.flat !== undefined
      ) {
        return view;
      }
      const repositories = new Set(action.names);
      const inRepository = action.inRepository === true;
      if (
        repositories.size === pane.repositories.size &&
        [...repositories].every((name) => pane.repositories.has(name)) &&
        inRepository === (pane.inRepository === true)
      ) {
        return view;
      }
      return withPane(view, action.side, {
        ...pane,
        repositories,
        inRepository,
        rows: pane.rows.map((row) => {
          const repository =
            row.entry?.folder === true && repositories.has(row.key);
          return row.repository === repository ? row : { ...row, repository };
        }),
      });
    }
    case 'folderSizes': {
      const pane = view.panes[action.side];
      if (
        action.tab !== view.tab ||
        pane === undefined ||
        pane.folder !== action.folder ||
        pane.flat !== undefined
      ) {
        return view;
      }
      const told = new Map(
        action.entries
          .filter((entry) => entry.folder)
          .map((entry) => [entry.name, entry]),
      );
      let changed = false;
      const entries = pane.entries.map((entry) => {
        const sized = entry.folder ? told.get(entry.name) : undefined;
        if (sized === undefined) {
          return entry;
        }
        changed = true;
        return sized;
      });
      return changed
        ? withPane(
            view,
            action.side,
            relisted(
              pane,
              pane.sort,
              { ...pane, entries },
              view.showHidden,
              view.fileColors,
              undefined,
              pane,
            ),
          )
        : view;
    }
    case 'select': {
      const pane = view.panes[action.side];
      return pane?.rows.some((row) => row.key === action.key)
        ? withPane(view, action.side, { ...pane, selected: action.key })
        : view;
    }
    case 'mark': {
      const pane = view.panes[action.side];
      if (pane === undefined) {
        return view;
      }
      const asked = new Set(action.keys);
      const markable = new Set<string>();
      for (const row of pane.rows) {
        if (row.entry !== undefined && asked.has(row.key)) {
          markable.add(row.key);
        }
      }
      const marked = new Set(pane.marked);
      for (const key of action.keys) {
        if (!markable.has(key)) {
          continue;
        }
        if (action.marked) {
          marked.add(key);
        } else {
          marked.delete(key);
        }
      }
      return withPane(view, action.side, { ...pane, marked });
    }
    case 'sort': {
      const pane = view.panes[action.side];
      if (pane === undefined) {
        return view;
      }
      if (pane.flat !== undefined) {
        return withPane(view, action.side, { ...pane, sort: action.sort });
      }
      return withPane(view, action.side, {
        ...pane,
        sort: action.sort,
        rows: rowsOf(
          pane.entries,
          pane.parent,
          view.showHidden,
          action.sort,
          pane.repositories,
          view.fileColors,
        ),
      });
    }
    case 'layout':
      return view.layouts[action.side] === action.layout
        ? view
        : {
            ...view,
            layouts: { ...view.layouts, [action.side]: action.layout },
          };
    case 'activate':
      return view.active === action.side
        ? view
        : { ...view, active: action.side };
    case 'switchSide':
      return { ...view, active: view.active === 'left' ? 'right' : 'left' };
    default:
      return action satisfies never;
  }
}
