import {
  type CommanderToWebviewOf,
  type FlatProgress,
} from '../shared/protocol';
import { sides, type Side } from '../shared/sides';
import { defaultLayouts, type Layout, type Layouts } from './layouts';
import { type ColumnWidths } from '../shared/columnWidths';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import { type Sort, type Sorts } from '../shared/sorts';
import { rowsOf, type Row } from './listing';
import {
  fileColorsOf,
  noFileColors,
  sameGrouping,
  type FileColors,
} from '../../../lib/page/fileColors';
import { flatListed, folderOfSelected, withFlatRows } from './flatPane';
import {
  duplicatesOf,
  noMarks,
  relisted,
  withFolderSizes,
  withMarks,
  withRepositories,
  type FlatShown,
  type KeptMarks,
  type PaneView,
} from './paneView';

export interface CommanderView {
  readonly tab: string | undefined;
  readonly showHidden: boolean;
  readonly sorts: Sorts;
  readonly columns: ColumnWidths;
  readonly defaultColumns: ColumnWidths;
  readonly canElevate: boolean;
  readonly gitMissing: boolean;
  readonly platform: string | undefined;
  readonly layouts: Layouts;
  readonly thumbnailSize: number;
  readonly fileColors: FileColors;
  readonly bookmarks: readonly string[];
  readonly active: Side;
  readonly share: number;
  readonly focus: KeptFocus | undefined;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
  readonly awaiting: Awaiting;
  readonly kept: ReadonlyMap<string, KeptTab>;
  readonly closedTab: string | undefined;
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

type Awaiting = Readonly<Record<Side, KeptMarks | undefined>>;

const noAwaiting: Awaiting = { left: undefined, right: undefined };

export interface KeptTab {
  readonly active: Side;
  readonly share: number;
  readonly focus: KeptFocus | undefined;
  readonly layouts: Layouts;
  readonly panes: Readonly<Record<Side, PaneView | undefined>>;
  readonly awaiting?: Awaiting;
}

function keptAway(view: CommanderView): ReadonlyMap<string, KeptTab> {
  if (view.tab === undefined || view.tab === view.closedTab) {
    return view.kept;
  }
  return new Map(view.kept).set(view.tab, {
    active: view.active,
    share: view.share,
    focus: view.focus,
    layouts: view.layouts,
    panes: view.panes,
    awaiting: view.awaiting,
  });
}

export const emptyView: CommanderView = {
  tab: undefined,
  showHidden: true,
  sorts: {
    left: { column: 'extension', descending: false, groupByColor: true },
    right: { column: 'extension', descending: false, groupByColor: true },
  },
  columns: { extension: 10, size: 17, date: 16 },
  defaultColumns: { extension: 10, size: 17, date: 16 },
  canElevate: false,
  gitMissing: false,
  platform: undefined,
  layouts: defaultLayouts,
  thumbnailSize: 144,
  fileColors: noFileColors,
  bookmarks: [],
  active: 'right',
  share: 0.5,
  focus: undefined,
  panes: { left: undefined, right: undefined },
  awaiting: noAwaiting,
  kept: new Map(),
  closedTab: undefined,
};

export type ViewAction =
  | {
      readonly type: 'show';
      readonly tab: string;
    }
  | { readonly type: 'hide' }
  | CommanderToWebviewOf<'closed'>
  | { readonly type: 'released'; readonly tab: string }
  | {
      readonly type: 'restore';
      readonly tab: string;
      readonly kept?: KeptTab;
    }
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
  | { readonly type: 'share'; readonly share: number }
  | { readonly type: 'focus'; readonly focus: KeptFocus | undefined }
  | { readonly type: 'switchSide' };

function marksAmong(
  rows: readonly Row[],
  keys: readonly string[],
): ReadonlySet<string> {
  const markable = new Set(
    rows.flatMap((row) => (row.entry === undefined ? [] : [row.key])),
  );
  const marked = keys.filter((key) => markable.has(key));
  return marked.length === 0 ? noMarks : new Set(marked);
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
    if (pane === undefined) {
      return undefined;
    }
    if (pane.flat !== undefined) {
      return { ...pane, sort: view.sorts[side], restored: true as const };
    }
    return {
      ...relisted(
        pane,
        view.sorts[side],
        pane,
        view.showHidden,
        view.fileColors,
        undefined,
      ),
      restored: true as const,
    };
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
        active: back?.active ?? emptyView.active,
        share: back?.share ?? emptyView.share,
        focus: back?.focus,
        layouts: back?.layouts ?? emptyView.layouts,
        panes: back === undefined ? emptyView.panes : settledPanes(view, back),
        awaiting: back?.awaiting ?? noAwaiting,
        kept,
        closedTab: undefined,
      };
    }
    case 'hide':
      return {
        ...view,
        tab: undefined,
        share: emptyView.share,
        focus: undefined,
        layouts: emptyView.layouts,
        panes: emptyView.panes,
        awaiting: noAwaiting,
        kept: keptAway(view),
        closedTab: undefined,
      };
    case 'closed':
      return {
        ...view,
        closedTab: view.tab === action.tab ? action.tab : view.closedTab,
        kept: without(view.kept, action.tab),
      };
    case 'released':
      return view.tab === action.tab
        ? view
        : {
            ...view,
            kept: without(view.kept, action.tab),
          };
    case 'restore':
      return view.tab === action.tab
        ? view
        : {
            ...view,
            kept:
              action.kept === undefined
                ? view.kept
                : new Map(view.kept).set(action.tab, action.kept),
          };
    case 'settings': {
      const settled: CommanderView = {
        ...view,
        showHidden: action.showHidden,
        sorts: action.sort,
        columns: action.columns,
        defaultColumns: action.defaultColumns,
        canElevate: action.canElevate,
        gitMissing: action.gitMissing === true,
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
      const awaited = view.awaiting[action.side];
      const restoring =
        pane === undefined &&
        flat === undefined &&
        awaited?.folder === action.folder
          ? awaited
          : undefined;
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
              action.selected ?? leftFlat ?? restoring?.selected,
              pane?.folder === action.folder && pane.flat === undefined
                ? pane
                : undefined,
            )
          : flatListed(pane, sort, { ...action, flat });
      const duplicates = duplicatesOf(
        pane?.folder === action.folder ? pane.duplicates : undefined,
        action.duplicates,
      );
      const {
        duplicates: _left,
        restored: _wasRestored,
        ...withoutDuplicates
      } = listed;
      const marked =
        restoring === undefined
          ? listed.marked
          : marksAmong(listed.rows, restoring.marked);
      const restored =
        restoring !== undefined ||
        (pane?.restored === true && pane.folder === action.folder);
      return withPane(
        awaited === undefined
          ? view
          : {
              ...view,
              awaiting: { ...view.awaiting, [action.side]: undefined },
            },
        action.side,
        {
          ...withoutDuplicates,
          marked,
          ...(duplicates !== undefined && { duplicates }),
          ...(restored && { restored: true as const }),
        },
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
      const pane =
        action.tab === view.tab
          ? withRepositories(view.panes[action.side], action)
          : undefined;
      return pane === undefined ? view : withPane(view, action.side, pane);
    }
    case 'folderSizes': {
      const pane =
        action.tab === view.tab
          ? withFolderSizes(
              view.panes[action.side],
              action,
              view.showHidden,
              view.fileColors,
            )
          : undefined;
      return pane === undefined ? view : withPane(view, action.side, pane);
    }
    case 'select': {
      const pane = view.panes[action.side];
      return pane?.rows.some((row) => row.key === action.key)
        ? withPane(view, action.side, { ...pane, selected: action.key })
        : view;
    }
    case 'mark': {
      const pane = withMarks(view.panes[action.side], action);
      return pane === undefined ? view : withPane(view, action.side, pane);
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
    case 'share':
      return view.share === action.share
        ? view
        : { ...view, share: action.share };
    case 'focus':
      return view.tab === undefined ||
        JSON.stringify(view.focus) === JSON.stringify(action.focus)
        ? view
        : { ...view, focus: action.focus };
    case 'switchSide':
      return { ...view, active: view.active === 'left' ? 'right' : 'left' };
    default:
      return action satisfies never;
  }
}
