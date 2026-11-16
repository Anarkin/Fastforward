import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { maxDroppedIcons } from '../shared/icons';
import { type CommanderDrop, type CommanderToHost } from '../shared/protocol';
import { sides, type Side } from '../shared/sides';
import type { ColumnWidths } from '../shared/columnWidths';
import { narrows, searchFilter } from '../../../lib/shared/filter';
import { plainSearch } from '../../../lib/shared/searchOptions';
import {
  commanderDefaults,
  type CommanderActions,
  type CommanderSource,
  type CommanderState,
} from './commanderState';
import { received, released } from './commanderReceived';
import { filesToCompare } from './comparing';
import { dialogActions, type StoreParts } from './dialogActions';
import { flatActions, startFlatWorker, type FlatOptions } from './flatActions';
import { filteredSelection, nearestShown } from './rowSelection';
import { nextSort } from './rowOrder';
import { shownColumns, shownRowsOf } from './shownRows';
import { filterKey, filterOf, seenFilters, withoutTab } from './sideFilters';
import { reduceView, type ViewAction } from './view';
import { ScrollPlaces } from './scrollPlaces';
import { dialogSlots, settledDialogs, withoutParked } from './parkedDialogs';
import { keptTabActions } from './keptTabActions';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';

const maxCameIcons = 5000;

const tabOfScroll = (key: string) => key.slice(0, key.indexOf(' '));

export function createCommanderStore(
  post: (message: CommanderToHost) => void,
  initial: Partial<CommanderSource> = {},
  flatOptions: FlatOptions = { worker: startFlatWorker },
  dropFiles: (
    files: readonly File[],
    message: CommanderDrop,
  ) => void = () => {},
  views: ToolViews = noViews,
): StoreApi<CommanderState> {
  const dropped: string[] = [];
  const cameIcons = new Map<string, string>();
  const scrolls = new ScrollPlaces();
  const saveColumns = (columns: ColumnWidths) =>
    post({ type: 'columns', columns });
  return createStore<CommanderState>()((set, get, api) => {
    const announced = (change: () => void) => {
      const before = get().view;
      change();
      const filters = seenFilters(get());
      if (filters !== get().filters) {
        set({ filters });
      }
      const dialogs = settledDialogs(get());
      if (dialogs !== undefined) {
        set(dialogs);
      }
      for (const side of sides) {
        const pane = get().view.panes[side];
        const was = before.panes[side];
        const nearest =
          pane === undefined ||
          (pane.rows === was?.rows && pane.duplicates === was.duplicates) ||
          (pane.duplicates?.reading === true &&
            pane.duplicates.groups.length === 0)
            ? undefined
            : nearestShown(
                pane.rows,
                shownRowsOf(get(), side).rows,
                pane.selected,
              );
        if (nearest !== undefined && nearest !== pane?.selected) {
          set((state) => ({
            view: reduceView(state.view, {
              type: 'select',
              side,
              key: nearest,
            }),
          }));
        }
      }
      const { tab, active } = get().view;
      if (
        tab !== undefined &&
        (tab !== before.tab || active !== before.active)
      ) {
        post({ type: 'activate', tab, side: active });
      }
      flat.reconcile();
    };
    const dispatch = (action: ViewAction) =>
      announced(() =>
        set((state) => {
          const view = reduceView(state.view, action);
          return view === state.view ? state : { view };
        }),
      );
    const onTab = (send: (tab: string) => void) => {
      const { tab } = get().view;
      if (tab !== undefined) {
        send(tab);
      }
    };
    const onPane = (
      side: Side,
      send: (tab: string, folder: string) => void,
    ) => {
      const { tab, panes } = get().view;
      const folder = panes[side]?.folder;
      if (tab !== undefined && folder !== undefined) {
        send(tab, folder);
      }
    };
    const onDisk = (
      side: Side,
      send: (tab: string, folder: string) => void,
    ) => {
      if (get().view.panes[side]?.archive === undefined) {
        onPane(side, send);
      }
    };
    const parts: StoreParts = { set, get, post, onTab, onPane, onDisk };
    const flat = flatActions(parts, flatOptions);
    const kept = keptTabActions(parts, scrolls, views);
    const shownWhenReleased = new Set<string>();
    const letGo = (tab: string) => {
      announced(() => set((state) => released(state, tab)));
      scrolls.forget(`${tab} `);
      forgetTab(tab);
    };
    const forgetTab = (tab: string) => {
      set((state) => ({
        filters: withoutTab(state.filters, tab),
        parked: withoutParked(state.parked, tab),
      }));
    };
    api.subscribe((state, before) => {
      if (
        state.view !== before.view ||
        state.filters !== before.filters ||
        state.parked !== before.parked ||
        dialogSlots.some((slot) => state[slot] !== before[slot])
      ) {
        kept.changed(state.view.tab);
      }
    });
    const sortOf = (side: Side) => {
      const { panes, sorts } = get().view;
      return panes[side]?.sort ?? sorts[side];
    };
    const sortBy = (side: Side, sort: ReturnType<typeof sortOf>) => {
      dispatch({ type: 'sort', side, sort });
      post({ type: 'sort', side, sort });
    };
    return {
      ...commanderDefaults,
      ...initial,
      receive: (message) => {
        if (message.type === 'flatFiles') {
          flat.heard(message);
        }
        const leaving = get().view.tab;
        if (message.type === 'show') {
          kept.shown(message);
        }
        announced(() => set((state) => received(state, message)));
        if (message.type === 'show' || message.type === 'hide') {
          kept.leaving(leaving);
          if (
            leaving !== undefined &&
            leaving !== get().view.tab &&
            shownWhenReleased.delete(leaving)
          ) {
            letGo(leaving);
          }
        }
        if (message.type === 'show' || message.type === 'closed') {
          shownWhenReleased.delete(message.tab);
        }
        if (message.type === 'closed') {
          kept.forget(message.tab);
          forgetTab(message.tab);
        }
      },
      dispatch,
      select: (side, key) => dispatch({ type: 'select', side, key }),
      mark: (side, keys, marked) =>
        dispatch({ type: 'mark', side, keys, marked }),
      activate: (side) => dispatch({ type: 'activate', side }),
      switchSide: () => dispatch({ type: 'switchSide' }),
      chooseLayout: (side, layout) =>
        dispatch({ type: 'layout', side, layout }),
      sort: (side, column) => sortBy(side, nextSort(sortOf(side), column)),
      groupByColor: (side) => {
        const current = sortOf(side);
        sortBy(side, { ...current, groupByColor: !current.groupByColor });
      },
      open: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'open', tab, side, folder, name }),
        ),
      step: (side, step) =>
        onTab((tab) => post({ type: 'step', tab, side, step })),
      viewFile: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'view', tab, side, folder, name }),
        ),
      editFile: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'editFile', tab, side, folder, name }),
        ),
      openRepository: (side, name) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'openRepository', tab, side, folder, name }),
        ),
      folderCommand: (side, name, command) =>
        onDisk(side, (tab, folder) =>
          post({
            type: 'folderCommand',
            tab,
            side,
            folder,
            ...(name !== undefined && { name }),
            command,
          }),
        ),
      openOnSide: (from, side, name) =>
        onPane(from, (tab, folder) =>
          post({ type: 'openOnSide', tab, from, side, folder, name }),
        ),
      enterArchive: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'enterArchive', tab, side, folder, name }),
        ),
      answerUpdate: (update) => {
        const { askingUpdate } = get();
        if (askingUpdate !== undefined) {
          set({ askingUpdate: undefined });
          post({ type: 'updateArchive', ask: askingUpdate.ask, update });
        }
      },
      answerPassword: (password) => {
        const { askingPassword } = get();
        if (askingPassword !== undefined) {
          set({ askingPassword: undefined });
          post({
            type: 'password',
            ask: askingPassword.ask,
            ...(password !== undefined && { password }),
          });
        }
      },
      drive: (side, drive) =>
        onTab((tab) => post({ type: 'drive', tab, side, drive })),
      listDrives: () => post({ type: 'listDrives' }),
      addBookmark: (side) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'addBookmark', tab, side, folder }),
        ),
      removeBookmark: (folder) => post({ type: 'removeBookmark', folder }),
      goToBookmark: (side, folder) =>
        onTab((tab) => post({ type: 'goToBookmark', tab, side, folder })),
      reread: () =>
        onTab((tab) => post({ type: 'reread', tab, side: get().view.active })),
      toggleHidden: () =>
        post({ type: 'showHidden', shown: !get().view.showHidden }),
      compare: () =>
        onTab((tab) => {
          const state = get();
          const { active, panes } = state.view;
          const files = filesToCompare(active, panes, {
            left: shownRowsOf(state, 'left').rows,
            right: shownRowsOf(state, 'right').rows,
          });
          post({ type: 'compare', tab, files: files ?? [] });
        }),
      shellMenu: (side, names, at, extended) =>
        onDisk(side, (tab, folder) =>
          post({
            type: 'shellMenu',
            tab,
            side,
            folder,
            names,
            x: at.x,
            y: at.y,
            extended,
          }),
        ),
      ...dialogActions(parts),
      copyToClipboard: (side, names) =>
        onPane(side, (tab, folder) =>
          post({ type: 'copyToClipboard', tab, side, folder, names }),
        ),
      dropOn: (side, files, into, move) =>
        onDisk(side, (tab, folder) =>
          dropFiles(files, {
            type: 'drop',
            tab,
            side,
            folder,
            ...(into !== undefined && { into }),
            move,
          }),
        ),
      drag: (side, names) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'drag', tab, side, folder, names }),
        ),
      paste: (side) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'paste', tab, side, folder }),
        ),
      testArchives: (side, names) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'testArchives', tab, side, folder, names }),
        ),
      resizeColumn: (column, width) =>
        set((state) =>
          shownColumns(state)[column] === width
            ? state
            : {
                resized: {
                  from: state.view.columns,
                  widths: { ...shownColumns(state), [column]: width },
                },
              },
        ),
      saveColumn: (column, width) =>
        saveColumns({ ...get().view.columns, [column]: width }),
      resetColumn: (column) => {
        const { columns, defaultColumns } = get().view;
        saveColumns({ ...columns, [column]: defaultColumns[column] });
      },
      scrollOf: (key) => scrolls.of(key),
      filterSide: (side, query, options) => {
        set((state) => {
          const { tab, panes } = state.view;
          const folder = panes[side]?.folder;
          if (tab === undefined) {
            return state;
          }
          const key = filterKey(tab, side);
          const filters = new Map(state.filters);
          if (query === undefined) {
            filters.delete(key);
          } else {
            filters.set(key, {
              folder,
              query,
              options: options ?? filters.get(key)?.options ?? plainSearch,
            });
          }
          return { filters };
        });
        const selected = get().view.panes[side]?.selected;
        const shownFilter = filterOf(get(), side);
        const selection =
          shownFilter === undefined ||
          !narrows(searchFilter(shownFilter.query, shownFilter.options))
            ? undefined
            : filteredSelection(shownRowsOf(get(), side).rows, selected);
        if (selection !== undefined && selection !== selected) {
          dispatch({ type: 'select', side, key: selection });
        }
        flat.reconcile();
      },
      ...flat.actions,
      duplicates: (side) =>
        onTab((tab) =>
          post({
            type: 'duplicates',
            tab,
            side,
            duplicates: get().view.panes[side]?.duplicates === undefined,
          }),
        ),
      countSizes: (side, names) =>
        onDisk(side, (tab, folder) =>
          post({ type: 'countSizes', tab, side, folder, names }),
        ),
      keepScroll: (key, offset) => {
        scrolls.keep(key, offset);
        kept.changed(tabOfScroll(key));
      },
      keepTabs: () => kept.flush(),
      releaseTab: (tab) => {
        if (!kept.knows(tab)) {
          return undefined;
        }
        const view = kept.release(tab);
        if (get().view.tab === tab) {
          shownWhenReleased.add(tab);
        }
        letGo(tab);
        return view;
      },
      iconTicketOf: (url) => cameIcons.get(url),
      iconCame: (url, ticket) => {
        cameIcons.delete(url);
        cameIcons.set(url, ticket);
        const oldest = cameIcons.keys().next().value;
        if (cameIcons.size > maxCameIcons && oldest !== undefined) {
          cameIcons.delete(oldest);
        }
      },
      dropIcon: (ticket) => {
        if (dropped.push(ticket) > 1) {
          return;
        }
        queueMicrotask(() => {
          const tickets = dropped.splice(0);
          for (let from = 0; from < tickets.length; from += maxDroppedIcons) {
            post({
              type: 'dropIcons',
              tickets: tickets.slice(from, from + maxDroppedIcons),
            });
          }
        });
      },
      saveThumbnail: async (source, box, pixelRatio, made) => {
        const bytes = new Uint8Array(await made.arrayBuffer());
        post({ type: 'saveThumbnail', ...source, box, pixelRatio, bytes });
      },
    };
  });
}

export const CommanderStore = createContext<
  StoreApi<CommanderState> | undefined
>(undefined);

function useCommanderStore(): StoreApi<CommanderState> {
  const store = useContext(CommanderStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('commander'));
  }
  return store;
}

export function useCommander<T>(select: (state: CommanderState) => T): T {
  return useStore(useCommanderStore(), select);
}

export function useCommanderActions(): CommanderActions {
  return useCommanderStore().getState();
}
