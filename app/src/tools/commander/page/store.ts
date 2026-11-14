import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { maxDroppedIcons } from '../shared/icons';
import type { PdfPlace } from '../shared/pdf';
import {
  maxFindLength,
  sides,
  type CommanderDrop,
  type CommanderToHost,
  type Side,
} from '../shared/protocol';
import type { ColumnWidths } from '../shared/settings';
import { filterWords } from '../../../lib/page/fileFilter';
import {
  commanderDefaults,
  type CommanderActions,
  type CommanderSource,
  type CommanderState,
  type KeptEditor,
  type ToViewer,
} from './commanderState';
import {
  isEditorStream,
  isViewerStream,
  received,
  stillShown,
  stillTargeted,
} from './commanderReceived';
import { filesToCompare } from './comparing';
import { dialogActions } from './dialogActions';
import { filteredSelection, nearestShown, nextSort } from './listing';
import {
  filterKey,
  filterOf,
  flatPanesOf,
  seenFilters,
  shownColumns,
  shownRowsOf,
  withoutTab,
} from './shownRows';
import { reduceView, type ViewAction } from './view';
import { ScrollPlaces } from './scrollPlaces';
import { FlatLists, type FlatTiming, type FlatWorker } from './flatLists';
import type { ToEditor } from './editorState';

function startFlatWorker(): FlatWorker {
  return new Worker(new URL('flatWorker.js', location.href), {
    type: 'module',
  });
}

const pdfPlaceWait = 2000;

const pdfPlaceEvery = 1000;

export function createCommanderStore(
  post: (message: CommanderToHost) => void,
  initial: Partial<CommanderSource> = {},
  flatOptions: {
    readonly worker: () => FlatWorker;
    readonly timing?: FlatTiming;
  } = { worker: startFlatWorker },
  dropFiles: (
    files: readonly File[],
    message: CommanderDrop,
  ) => void = () => {},
): StoreApi<CommanderState> {
  const dropped: string[] = [];
  const scrolls = new ScrollPlaces();
  const places = new Map<string, number>();
  const viewerListeners = new Set<(message: ToViewer) => void>();
  const editorListeners = new Set<(message: ToEditor) => void>();
  const keptEditors = new Map<string, KeptEditor>();
  const listenEditor = (handler: (message: ToEditor) => void) => {
    editorListeners.add(handler);
    return () => {
      editorListeners.delete(handler);
    };
  };
  const listenViewer = (handler: (message: ToViewer) => void) => {
    viewerListeners.add(handler);
    return () => {
      viewerListeners.delete(handler);
    };
  };
  let viewerRequests = 0;
  let pendingPdfPlace:
    | {
        readonly tab: string;
        readonly fingerprint: string;
        readonly place: PdfPlace;
      }
    | undefined;
  let pdfPlaceTimer: ReturnType<typeof setTimeout> | undefined;
  const flushPdfPlace = () => {
    clearTimeout(pdfPlaceTimer);
    pdfPlaceTimer = undefined;
    const pending = pendingPdfPlace;
    pendingPdfPlace = undefined;
    if (pending !== undefined) {
      post({ type: 'savePdfPlace', ...pending });
    }
  };
  const saveColumns = (columns: ColumnWidths) =>
    post({ type: 'columns', columns });
  return createStore<CommanderState>()((set, get) => {
    const flats = new FlatLists(
      flatOptions.worker,
      () => reconcileFlats(),
      flatOptions.timing,
    );
    const reconcileFlats = () => {
      const state = get();
      const { view } = state;
      const live = flatPanesOf(view);
      for (const pane of flats.panes()) {
        if (!live.has(pane)) {
          flats.drop(pane);
        }
      }
      const { tab, panes } = view;
      if (tab === undefined) {
        return;
      }
      for (const side of sides) {
        const pane = panes[side];
        const flat = pane?.flat;
        if (pane === undefined || flat === undefined) {
          continue;
        }
        const key = filterKey(tab, side);
        flats.ensure(key, flat.walk, pane.parent, {
          sort: pane.sort,
          showHidden: view.showHidden,
          fileColors: view.fileColors,
          query: filterOf(state, side) ?? '',
        });
        const built = flats.built(key, flat.walk);
        if (
          built !== undefined &&
          (built.rows !== pane.rows || built.shown !== flat.shown)
        ) {
          set((now) => ({
            view: reduceView(now.view, {
              type: 'flatRows',
              tab,
              side,
              walk: flat.walk,
              rows: built.rows,
              shown: built.shown,
              complete: built.complete,
            }),
          }));
        }
      }
    };
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
      reconcileFlats();
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
          for (const handler of viewerListeners) {
            handler(message);
          }
          return;
        }
        if (isEditorStream(message)) {
          for (const handler of editorListeners) {
            handler(message);
          }
          return;
        }
        if (message.type === 'flatFiles') {
          const { tab, panes } = get().view;
          const pane = panes[message.side];
          if (
            tab === message.tab &&
            pane?.flat?.walk === message.walk &&
            pane.folder === message.folder
          ) {
            flats.files(
              filterKey(message.tab, message.side),
              message.walk,
              message.folders,
            );
          }
        }
        announced(() => set((state) => received(state, message)));
        if (message.type === 'closed') {
          places.delete(message.tab);
          keptEditors.delete(message.tab);
          set((state) => ({ filters: withoutTab(state.filters, message.tab) }));
        }
      },
      request: post,
      listenViewer,
      findText: (tab, encoding, query, onFound) => {
        if (query.length > maxFindLength) {
          onFound({ matches: [], done: true });
          return () => undefined;
        }
        const request = ++viewerRequests;
        const stop = listenViewer((message) => {
          if (
            message.type === 'found' &&
            message.tab === tab &&
            message.request === request
          ) {
            onFound({ matches: message.matches, done: message.done });
          }
        });
        post({ type: 'findText', tab, encoding, query, request });
        return () => {
          stop();
          post({ type: 'stopFind', tab, request });
        };
      },
      readWholeText: (tab, encoding, onText) => {
        const request = ++viewerRequests;
        const stop = listenViewer((message) => {
          if (
            message.type === 'text' &&
            message.tab === tab &&
            message.request === request &&
            message.text !== undefined
          ) {
            onText(message.text);
          }
        });
        post({ type: 'readText', tab, encoding, request });
        return stop;
      },
      readPdfPlace: (tab, fingerprint) =>
        new Promise((resolve) => {
          const request = ++viewerRequests;
          const answered = (place: PdfPlace | undefined) => {
            clearTimeout(waiting);
            stop();
            resolve(place);
          };
          const waiting = setTimeout(() => answered(undefined), pdfPlaceWait);
          const stop = listenViewer((message) => {
            if (message.type === 'pdfPlace' && message.request === request) {
              answered(message.place);
            }
          });
          post({ type: 'readPdfPlace', tab, fingerprint, request });
        }),
      keepPdfPlace: (tab, fingerprint, place) => {
        pendingPdfPlace = { tab, fingerprint, place };
        pdfPlaceTimer ??= setTimeout(flushPdfPlace, pdfPlaceEvery);
      },
      flushPdfPlace,
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
      editFile: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'editFile', tab, side, folder, name }),
        ),
      listenEditor,
      keptEditor: (tab) => keptEditors.get(tab),
      keepEditor: (tab, kept) => {
        keptEditors.set(tab, kept);
      },
      readEdited: (tab) => post({ type: 'readEdited', tab }),
      editText: (tab, update) => post({ type: 'editText', tab, update }),
      keepEditState: (tab, version, state) =>
        post({ type: 'editState', tab, version, state }),
      saveText: (tab, overwrite) =>
        post({
          type: 'saveText',
          tab,
          ...(overwrite?.readOnly === true && { overwriteReadOnly: true }),
          ...(overwrite?.changed === true && { overwriteChanged: true }),
        }),
      reloadEdited: (tab) => post({ type: 'reloadEdited', tab }),
      editSource: (tab, file) => post({ type: 'editSource', tab, file }),
      editViewed: (tab, at, encoding) =>
        post({
          type: 'editViewed',
          tab,
          at,
          ...(encoding !== undefined && { encoding }),
        }),
      saveIn: (tab, encoding, bom) =>
        post({ type: 'saveIn', tab, encoding, bom }),
      reopenIn: (tab, encoding) => post({ type: 'reopenIn', tab, encoding }),
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
      ...dialogActions({ set, get, post, onTab, onPane, onDisk }),
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
      placeOf: (tab) => places.get(tab) ?? 0,
      keepPlace: (tab, byte) => {
        places.set(tab, byte);
      },
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
        reconcileFlats();
      },
      flat: (side) =>
        onTab((tab) =>
          post({
            type: 'flat',
            tab,
            side,
            flat: get().view.panes[side]?.flat === undefined,
          }),
        ),
      duplicates: (side) =>
        onTab((tab) =>
          post({
            type: 'duplicates',
            tab,
            side,
            duplicates: get().view.panes[side]?.duplicates === undefined,
          }),
        ),
      stopReading: (side) =>
        onTab((tab) => post({ type: 'stopReading', tab, side })),
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
