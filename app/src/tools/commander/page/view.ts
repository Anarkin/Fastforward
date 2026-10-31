import {
  sides,
  type CommanderToWebviewOf,
  type Entry,
  type Side,
} from '../shared/protocol';
import type { ColumnWidths, Sort, Sorts } from '../shared/settings';
import { rowsOf, selectionAfter, type Row, type Selection } from './listing';

interface Listed {
  readonly folder: string;
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
}

export interface CommanderView {
  readonly tab: string | undefined;
  readonly showHidden: boolean;
  readonly sorts: Sorts;
  readonly columns: ColumnWidths;
  readonly defaultColumns: ColumnWidths;
  readonly canElevate: boolean;
  readonly active: Side;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
}

export const emptyView: CommanderView = {
  tab: undefined,
  showHidden: true,
  sorts: {
    left: { column: 'extension', descending: false },
    right: { column: 'extension', descending: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  active: 'right',
  panes: { left: undefined, right: undefined },
};

export type ViewAction =
  | { readonly type: 'show'; readonly tab: string }
  | { readonly type: 'hide' }
  | (Omit<CommanderToWebviewOf<'settings'>, 'type'> & {
      readonly type: 'settings';
    })
  | (Omit<CommanderToWebviewOf<'listing'>, 'type'> & {
      readonly type: 'listing';
    })
  | { readonly type: 'select'; readonly side: Side; readonly key: string }
  | { readonly type: 'sort'; readonly side: Side; readonly sort: Sort }
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
  return one.column === other.column && one.descending === other.descending;
}

function relisted(
  pane: PaneView | undefined,
  sort: Sort,
  { folder, entries, parent, back, forward, elevated }: Listed,
  showHidden: boolean,
  selected: string | undefined,
): PaneView {
  const rows = rowsOf(entries, parent, showHidden, sort);
  return {
    folder,
    entries,
    parent,
    back,
    forward,
    elevated,
    sort,
    rows,
    selected: selectionAfter(selectionIn(pane), folder, rows, selected),
  };
}

function withPane(
  view: CommanderView,
  side: Side,
  pane: PaneView,
): CommanderView {
  return { ...view, panes: { ...view.panes, [side]: pane } };
}

export function reduceView(
  view: CommanderView,
  action: ViewAction,
): CommanderView {
  switch (action.type) {
    case 'show':
      return view.tab === action.tab
        ? view
        : {
            ...view,
            tab: action.tab,
            active: emptyView.active,
            panes: emptyView.panes,
          };
    case 'hide':
      return { ...view, tab: undefined, panes: emptyView.panes };
    case 'settings': {
      const settled = {
        ...view,
        showHidden: action.showHidden,
        sorts: action.sort,
        columns: action.columns,
        defaultColumns: action.defaultColumns,
        canElevate: action.canElevate,
      };
      return sides.reduce((next, side) => {
        const pane = view.panes[side];
        return pane &&
          (action.showHidden !== view.showHidden ||
            !sameSort(pane.sort, action.sort[side]))
          ? withPane(
              next,
              side,
              relisted(
                pane,
                action.sort[side],
                pane,
                action.showHidden,
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
              action.selected,
            ),
          )
        : view;
    case 'select': {
      const pane = view.panes[action.side];
      return pane?.rows.some((row) => row.key === action.key)
        ? withPane(view, action.side, { ...pane, selected: action.key })
        : view;
    }
    case 'sort': {
      const pane = view.panes[action.side];
      if (pane === undefined) {
        return view;
      }
      return withPane(view, action.side, {
        ...pane,
        sort: action.sort,
        rows: rowsOf(pane.entries, pane.parent, view.showHidden, action.sort),
      });
    }
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
