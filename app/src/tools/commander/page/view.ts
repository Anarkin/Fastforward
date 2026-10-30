import {
  sides,
  type CommanderToWebviewOf,
  type Entry,
  type Side,
} from '../shared/protocol';
import type { ColumnWidths, Sort, SortColumn } from '../shared/settings';
import {
  nextSort,
  rowsOf,
  selectionAfter,
  type Row,
  type Selection,
} from './listing';

export interface PaneView {
  readonly folder: string;
  readonly entries: readonly Entry[];
  readonly parent: boolean;
  readonly sort: Sort;
  readonly rows: readonly Row[];
  readonly selected: string | undefined;
}

export interface CommanderView {
  readonly tab: string | undefined;
  readonly dateFormat: string;
  readonly showHidden: boolean;
  readonly sort: Sort;
  readonly columns: ColumnWidths;
  readonly defaultColumns: ColumnWidths;
  readonly active: Side;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
}

export const emptyView: CommanderView = {
  tab: undefined,
  dateFormat: 'YYYY-MM-DD HH:mm',
  showHidden: true,
  sort: { column: 'extension', descending: false },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
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
  | { readonly type: 'sort'; readonly side: Side; readonly column: SortColumn }
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

function relisted(
  pane: PaneView | undefined,
  defaultSort: Sort,
  folder: string,
  entries: readonly Entry[],
  parent: boolean,
  showHidden: boolean,
  selected: string | undefined,
): PaneView {
  const sort = pane?.sort ?? defaultSort;
  const rows = rowsOf(entries, parent, showHidden, sort);
  return {
    folder,
    entries,
    parent,
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
        dateFormat: action.dateFormat,
        showHidden: action.showHidden,
        sort: action.sort,
        columns: action.columns,
        defaultColumns: action.defaultColumns,
      };
      return action.showHidden === view.showHidden
        ? settled
        : sides.reduce((next, side) => {
            const pane = view.panes[side];
            return pane
              ? withPane(
                  next,
                  side,
                  relisted(
                    pane,
                    pane.sort,
                    pane.folder,
                    pane.entries,
                    pane.parent,
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
              view.sort,
              action.folder,
              action.entries,
              action.parent,
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
      const sort = nextSort(pane.sort, action.column);
      return withPane(view, action.side, {
        ...pane,
        sort,
        rows: rowsOf(pane.entries, pane.parent, view.showHidden, sort),
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
