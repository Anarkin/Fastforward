import {
  sides,
  type CommanderToWebviewOf,
  type Entry,
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
import { rowsOf, selectionAfter, type Row, type Selection } from './listing';
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
}

export interface PaneView extends Listed {
  readonly sort: Sort;
  readonly rows: readonly Row[];
  readonly selected: string | undefined;
  readonly marked: ReadonlySet<string>;
  readonly repositories: ReadonlySet<string>;
}

const noMarks: ReadonlySet<string> = new Set();

const noRepositories: ReadonlySet<string> = new Set();

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
  const keys = new Set(rows.map((row) => row.key));
  return new Set([...pane.marked].filter((key) => keys.has(key)));
}

export interface CommanderView {
  readonly tab: string | undefined;
  readonly viewing: string | undefined;
  readonly showHidden: boolean;
  readonly sorts: Sorts;
  readonly columns: ColumnWidths;
  readonly defaultColumns: ColumnWidths;
  readonly canElevate: boolean;
  readonly layouts: Layouts;
  readonly thumbnailSize: number;
  readonly fileColors: FileColors;
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
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  layouts: defaultLayouts,
  thumbnailSize: 144,
  fileColors: noFileColors,
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
  | { readonly type: 'choose'; readonly choices: ViewerChoices }
  | (Omit<CommanderToWebviewOf<'settings'>, 'type'> & {
      readonly type: 'settings';
    })
  | (Omit<CommanderToWebviewOf<'listing'>, 'type'> & {
      readonly type: 'listing';
    })
  | (Omit<CommanderToWebviewOf<'repositories'>, 'type'> & {
      readonly type: 'repositories';
    })
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
  { folder, hidden, entries, parent, back, forward, elevated }: Listed,
  showHidden: boolean,
  fileColors: FileColors,
  selected: string | undefined,
): PaneView {
  const repositories = repositoriesKept(pane, folder);
  const rows = rowsOf(
    entries,
    parent,
    showHidden,
    sort,
    repositories,
    fileColors,
  );
  return {
    folder,
    hidden,
    entries,
    parent,
    back,
    forward,
    elevated,
    sort,
    rows,
    selected: selectionAfter(selectionIn(pane), folder, rows, selected),
    marked: marksKept(pane, folder, rows),
    repositories,
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
      if (view.tab === action.tab) {
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
            viewers: new Map(view.viewers).set(view.tab, action.choices),
          };
    case 'settings': {
      const settled = {
        ...view,
        showHidden: action.showHidden,
        sorts: action.sort,
        columns: action.columns,
        defaultColumns: action.defaultColumns,
        canElevate: action.canElevate,
        thumbnailSize: action.thumbnailSize,
        fileColors: fileColorsOf(action.fileColors),
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
              relisted(
                pane,
                sort,
                pane,
                action.showHidden,
                settled.fileColors,
                undefined,
              ),
            )
          : next;
      }, settled);
    }
    case 'listing':
      return action.tab === view.tab
        ? withPane(
            view,
            action.side,
            relisted(
              view.panes[action.side],
              view.panes[action.side]?.sort ?? view.sorts[action.side],
              action,
              view.showHidden,
              view.fileColors,
              action.selected,
            ),
          )
        : view;
    case 'repositories': {
      const pane = view.panes[action.side];
      if (
        action.tab !== view.tab ||
        pane === undefined ||
        pane.folder !== action.folder
      ) {
        return view;
      }
      const repositories = new Set(action.names);
      return withPane(view, action.side, {
        ...pane,
        repositories,
        rows: rowsOf(
          pane.entries,
          pane.parent,
          view.showHidden,
          pane.sort,
          repositories,
          view.fileColors,
        ),
      });
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
      const markable = new Set(
        pane.rows
          .filter((row) => row.entry !== undefined)
          .map((row) => row.key),
      );
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
