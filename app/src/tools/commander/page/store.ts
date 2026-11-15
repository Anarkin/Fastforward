import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { maxDroppedIcons } from '../shared/icons';
import { type CommanderDrop, type CommanderToHost } from '../shared/protocol';
import { sides, type Side } from '../shared/sides';
import type { ColumnWidths } from '../shared/columnWidths';
import { filterWords } from '../../../lib/page/fileFilter';
import {
  commanderDefaults,
  type CommanderActions,
  type CommanderSource,
  type CommanderState,
} from './commanderState';
import {
  isEditorStream,
  isViewerStream,
  received,
  stillShown,
  stillTargeted,
} from './commanderReceived';
import { filesToCompare } from './comparing';
import { dialogActions, type StoreParts } from './dialogActions';
import { editorActions } from './editorActions';
import { flatActions, startFlatWorker, type FlatOptions } from './flatActions';
import { filteredSelection, nearestShown } from './rowSelection';
import { nextSort } from './rowOrder';
import { shownColumns, shownRowsOf } from './shownRows';
import { filterKey, seenFilters, withoutTab } from './sideFilters';
import { reduceView, type ViewAction } from './view';
import { ScrollPlaces } from './scrollPlaces';
import { viewerActions } from './viewerActions';

export function createCommanderStore(
  post: (message: CommanderToHost) => void,
  initial: Partial<CommanderSource> = {},
  flatOptions: FlatOptions = { worker: startFlatWorker },
  dropFiles: (
    files: readonly File[],
    message: CommanderDrop,
  ) => void = () => {},
): StoreApi<CommanderState> {
  const dropped: string[] = [];
  const scrolls = new ScrollPlaces();
  const saveColumns = (columns: ColumnWidths) =>
    post({ type: 'columns', columns });
  return createStore<CommanderState>()((set, get) => {
    const announced = (change: () => void) => {
      const before = get().view;
      change();
      const filters = seenFilters(get());
      if (filters !== get().filters) {
        set({ filters });
      }
      const { deleting, transferring, makingFolder, makingFile, renaming } =
        get();
      if (makingFolder !== undefined && !stillShown(get().view, makingFolder)) {
        set({ makingFolder: undefined });
      }
      if (makingFile !== undefined && !stillShown(get().view, makingFile)) {
        set({ makingFile: undefined });
      }
      if (renaming !== undefined && !stillShown(get().view, renaming)) {
        set({ renaming: undefined });
      }
      const { goingTo, markingPattern } = get();
      if (goingTo !== undefined && !stillShown(get().view, goingTo)) {
        set({ goingTo: undefined });
      }
      if (
        markingPattern !== undefined &&
        !stillShown(get().view, markingPattern)
      ) {
        set({ markingPattern: undefined });
      }
      const { packing } = get();
      if (packing !== undefined && !stillShown(get().view, packing)) {
        set({ packing: undefined });
      }
      if (deleting !== undefined && !stillShown(get().view, deleting)) {
        set({ deleting: undefined });
      }
      if (
        transferring !== undefined &&
        !stillTargeted(get().view, transferring)
      ) {
        set({ transferring: undefined });
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
    const viewer = viewerActions(parts);
    const editor = editorActions(parts);
    const flat = flatActions(parts, flatOptions);
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
        if (isViewerStream(message)) {
          viewer.heard(message);
          return;
        }
        if (isEditorStream(message)) {
          editor.heard(message);
          return;
        }
        if (message.type === 'flatFiles') {
          flat.heard(message);
        }
        announced(() => set((state) => received(state, message)));
        if (message.type === 'closed') {
          viewer.forget(message.tab);
          editor.forget(message.tab);
          set((state) => ({ filters: withoutTab(state.filters, message.tab) }));
        }
      },
      ...viewer.actions,
      dispatch,
      select: (side, key) => dispatch({ type: 'select', side, key }),
      mark: (side, keys, marked) =>
        dispatch({ type: 'mark', side, keys, marked }),
      activate: (side) => dispatch({ type: 'activate', side }),
      switchSide: () => dispatch({ type: 'switchSide' }),
      chooseLayout: (side, layout) =>
        dispatch({ type: 'layout', side, layout }),
      choose: (choices) => dispatch({ type: 'choose', choices }),
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
      ...editor.actions,
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
      filterSide: (side, query) => {
        set((state) => {
          const { tab, panes } = state.view;
          const folder = panes[side]?.folder;
          if (tab === undefined) {
            return state;
          }
          const filters = new Map(state.filters);
          if (query === undefined) {
            filters.delete(filterKey(tab, side));
          } else {
            filters.set(filterKey(tab, side), { folder, query });
          }
          return { filters };
        });
        const selected = get().view.panes[side]?.selected;
        const selection =
          query === undefined || filterWords(query).length === 0
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
      keepScroll: (key, offset) => scrolls.keep(key, offset),
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
