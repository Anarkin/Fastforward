import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../shared/strings';
import { maxDroppedIcons, type IconSource } from '../shared/icons';
import type { PdfPlace } from '../../../shared/pdf';
import {
  otherSide,
  sides,
  type ByteRange,
  type CommanderDrop,
  type CommanderToHost,
  type CommanderToWebview,
  type FolderCommand,
  type Side,
  type TextEncoding,
} from '../shared/protocol';
import type { ClashAnswer, TransferView } from '../shared/transfers';
import type {
  ColumnWidths,
  Layout,
  SizedColumn,
  SortColumn,
} from '../shared/settings';
import { filterWords } from '../../../shared/fileFilter';
import { filesToCompare } from './comparing';
import {
  filteredRows,
  filteredSelection,
  nearestShown,
  nextSort,
  type Row,
} from './listing';
import {
  emptyView,
  reduceView,
  type CommanderView,
  type PaneView,
  type ViewAction,
  type ViewerChoices,
} from './view';
import type { ToViewer, Viewing } from './viewer';
import { ScrollPlaces } from './scrollPlaces';
import { FlatLists, type FlatTiming, type FlatWorker } from './flatLists';

type ViewerRequest = Extract<
  CommanderToHost,
  {
    readonly type: 'readText' | 'readRows' | 'readBytes';
  }
>;

interface Deleting {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly permanently: boolean;
  readonly binOff?: true;
}

interface Transferring {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly names: readonly string[];
  readonly target: string;
  readonly move: boolean;
}

interface MakingFolder {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
}

interface NoAccess {
  readonly side: Side;
  readonly folder: string;
  readonly asAdministrator: boolean;
}

interface CommanderSource {
  readonly view: CommanderView;
  readonly drives: readonly string[];
  readonly viewed: Viewing | undefined;
  readonly deleting: Deleting | undefined;
  readonly transferring: Transferring | undefined;
  readonly transfer: TransferView | undefined;
  readonly makingFolder: MakingFolder | undefined;
  readonly noAccess: NoAccess | undefined;
  readonly resized:
    { readonly from: ColumnWidths; readonly widths: ColumnWidths } | undefined;
  readonly filters: ReadonlyMap<string, PaneFilter>;
}

interface PaneFilter {
  readonly folder: string | undefined;
  readonly query: string;
}

interface CommanderActions {
  readonly receive: (message: CommanderToWebview) => void;
  readonly request: (message: ViewerRequest) => void;
  readonly listenViewer: (handler: (message: ToViewer) => void) => () => void;
  readonly findText: (
    tab: string,
    encoding: TextEncoding,
    query: string,
    onFound: (found: {
      readonly matches: readonly ByteRange[];
      readonly done: boolean;
    }) => void,
  ) => () => void;
  readonly readWholeText: (
    tab: string,
    encoding: TextEncoding,
    onText: (text: string) => void,
  ) => () => void;
  readonly readPdfPlace: (
    tab: string,
    fingerprint: string,
  ) => Promise<PdfPlace | undefined>;
  readonly keepPdfPlace: (
    tab: string,
    fingerprint: string,
    place: PdfPlace,
  ) => void;
  readonly flushPdfPlace: () => void;
  readonly dispatch: (action: ViewAction) => void;
  readonly select: (side: Side, key: string) => void;
  readonly mark: (side: Side, keys: readonly string[], marked: boolean) => void;
  readonly activate: (side: Side) => void;
  readonly switchSide: () => void;
  readonly chooseLayout: (side: Side, layout: Layout) => void;
  readonly choose: (choices: Partial<ViewerChoices>) => void;
  readonly sort: (side: Side, column: SortColumn) => void;
  readonly groupByColor: (side: Side) => void;
  readonly open: (side: Side, name: string) => void;
  readonly step: (side: Side, step: -1 | 1) => void;
  readonly viewFile: (side: Side, name: string) => void;
  readonly openRepository: (side: Side, name: string) => void;
  readonly folderCommand: (
    side: Side,
    name: string | undefined,
    command: FolderCommand,
  ) => void;
  readonly openOnSide: (from: Side, side: Side, name: string) => void;
  readonly drive: (side: Side, drive: string) => void;
  readonly listDrives: () => void;
  readonly addBookmark: (side: Side) => void;
  readonly removeBookmark: (folder: string) => void;
  readonly goToBookmark: (side: Side, folder: string) => void;
  readonly reread: () => void;
  readonly toggleHidden: () => void;
  readonly compare: () => void;
  readonly shellMenu: (
    side: Side,
    names: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => void;
  readonly askDelete: (
    side: Side,
    names: readonly string[],
    permanently: boolean,
  ) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
  readonly askTransfer: (
    side: Side,
    names: readonly string[],
    move: boolean,
  ) => void;
  readonly confirmTransfer: () => void;
  readonly cancelTransfer: () => void;
  readonly answerClash: (answer: ClashAnswer, all: boolean) => void;
  readonly copyToClipboard: (side: Side, names: readonly string[]) => void;
  readonly paste: (side: Side) => void;
  readonly drag: (side: Side, names: readonly string[]) => void;
  readonly dropOn: (
    side: Side,
    files: readonly File[],
    into: string | undefined,
    move: boolean,
  ) => void;
  readonly askNewFolder: (side: Side) => void;
  readonly makeFolder: (name: string) => void;
  readonly cancelNewFolder: () => void;
  readonly stopTransfer: () => void;
  readonly hideTransfer: () => void;
  readonly elevate: () => void;
  readonly closeNoAccess: () => void;
  readonly resizeColumn: (column: SizedColumn, width: number) => void;
  readonly saveColumn: (column: SizedColumn, width: number) => void;
  readonly resetColumn: (column: SizedColumn) => void;
  readonly dropIcon: (ticket: string) => void;
  readonly scrollOf: (key: string) => number;
  readonly placeOf: (tab: string) => number;
  readonly keepPlace: (tab: string, byte: number) => void;
  readonly filterSide: (side: Side, query: string | undefined) => void;
  readonly flat: (side: Side) => void;
  readonly stopReading: (side: Side) => void;
  readonly keepScroll: (key: string, offset: number) => void;
  readonly saveThumbnail: (
    source: IconSource,
    box: number,
    pixelRatio: number,
    made: Blob,
  ) => Promise<void>;
}

type CommanderState = CommanderSource & CommanderActions;

const commanderDefaults: CommanderSource = {
  view: emptyView,
  drives: [],
  viewed: undefined,
  deleting: undefined,
  transferring: undefined,
  transfer: undefined,
  makingFolder: undefined,
  noAccess: undefined,
  resized: undefined,
  filters: new Map(),
};

const viewerStreams: ReadonlySet<CommanderToWebview['type']> = new Set<
  ToViewer['type']
>(['rows', 'text', 'bytes', 'found', 'pdfPlace']);

function isViewerStream(message: CommanderToWebview): message is ToViewer {
  return viewerStreams.has(message.type);
}

export function shownColumns({ view, resized }: CommanderSource): ColumnWidths {
  return resized !== undefined && resized.from === view.columns
    ? resized.widths
    : view.columns;
}

function viewedOf(message: Extract<CommanderToWebview, { type: 'viewing' }>) {
  return {
    tab: message.tab,
    size: message.size,
    ...(message.version !== undefined && { version: message.version }),
    ...(message.binary !== undefined && { binary: message.binary }),
    ...(message.hidden !== undefined && { hidden: message.hidden }),
    ...(message.detected !== undefined && { detected: message.detected }),
    ...(message.error !== undefined && { error: message.error }),
  };
}

function sameViewed(shown: Viewing | undefined, told: Viewing): boolean {
  return (
    shown !== undefined &&
    shown.tab === told.tab &&
    shown.size === told.size &&
    shown.version === told.version &&
    shown.binary === told.binary &&
    shown.detected === told.detected &&
    shown.error === told.error &&
    shown.hidden?.length === told.hidden?.length &&
    (shown.hidden ?? []).every((part, index) => part === told.hidden?.[index])
  );
}

function received(
  state: CommanderSource,
  message: CommanderToWebview,
): Partial<CommanderSource> {
  if (isViewerStream(message)) {
    return state;
  }
  switch (message.type) {
    case 'drives':
      return { drives: message.drives };
    case 'transfer':
      return { transfer: message.view };
    case 'flatFiles': {
      const view = reduceView(state.view, {
        type: 'flatProgress',
        tab: message.tab,
        side: message.side,
        walk: message.walk,
        progress: message.progress,
      });
      return view === state.view ? state : { view };
    }
    case 'viewing': {
      const viewed = viewedOf(message);
      return sameViewed(state.viewed, viewed) ? state : { viewed };
    }
    case 'noAccess':
      return {
        noAccess: {
          side: message.side,
          folder: message.folder,
          asAdministrator: message.asAdministrator,
        },
      };
    default: {
      const view = reduceView(state.view, message);
      return view === state.view ? state : { view };
    }
  }
}

function stillShown(
  view: CommanderView,
  { tab, side, folder }: Pick<Deleting, 'tab' | 'side' | 'folder'>,
) {
  return view.tab === tab && view.panes[side]?.folder === folder;
}

function stillTargeted(view: CommanderView, transferring: Transferring) {
  return (
    stillShown(view, transferring) &&
    view.panes[otherSide(transferring.side)]?.folder === transferring.target
  );
}

function filterKey(tab: string, side: Side): string {
  return JSON.stringify([tab, side]);
}

export function filterOf(
  { view, filters }: CommanderSource,
  side: Side,
): string | undefined {
  const filter =
    view.tab === undefined ? undefined : filters.get(filterKey(view.tab, side));
  return filter !== undefined && filter.folder === view.panes[side]?.folder
    ? filter.query
    : undefined;
}

function seenFilters({
  view,
  filters,
}: CommanderSource): ReadonlyMap<string, PaneFilter> {
  const { tab, panes } = view;
  if (tab === undefined) {
    return filters;
  }
  const left = sides
    .map((side) => filterKey(tab, side))
    .filter((key, index) => {
      const filter = filters.get(key);
      const folder = panes[sides[index]]?.folder;
      return (
        filter !== undefined && folder !== undefined && filter.folder !== folder
      );
    });
  if (left.length === 0) {
    return filters;
  }
  const kept = new Map(filters);
  for (const key of left) {
    kept.delete(key);
  }
  return kept;
}

function withoutTab(
  filters: ReadonlyMap<string, PaneFilter>,
  tab: string,
): ReadonlyMap<string, PaneFilter> {
  const keys = sides.map((side) => filterKey(tab, side));
  if (!keys.some((key) => filters.has(key))) {
    return filters;
  }
  const kept = new Map(filters);
  for (const key of keys) {
    kept.delete(key);
  }
  return kept;
}

export interface ShownRows {
  readonly rows: readonly Row[];
  readonly files: number;
  readonly total: number;
}

const noRows: readonly Row[] = [];

const shownByRows = new WeakMap<
  readonly Row[],
  { readonly query: string; readonly shown: ShownRows }
>();

function filesIn(rows: readonly Row[]): number {
  return rows.reduce(
    (count, row) => (row.entry === undefined ? count : count + 1),
    0,
  );
}

function shownRowsIn(all: readonly Row[], query: string): ShownRows {
  const kept = shownByRows.get(all);
  if (kept?.query === query) {
    return kept.shown;
  }
  const rows = filteredRows(all, filterWords(query));
  const total = filesIn(all);
  const shown = { rows, files: rows === all ? total : filesIn(rows), total };
  shownByRows.set(all, { query, shown });
  return shown;
}

const flatShownByRows = new WeakMap<
  readonly Row[],
  { readonly all: readonly Row[]; readonly shown: ShownRows }
>();

function flatShownRows(
  all: readonly Row[],
  filtered: readonly Row[] | undefined,
): ShownRows {
  const rows = filtered ?? all;
  const kept = flatShownByRows.get(rows);
  if (kept?.all === all) {
    return kept.shown;
  }
  const total = filesIn(all);
  const shown = {
    rows,
    files: rows === all ? total : filesIn(rows),
    total,
  };
  flatShownByRows.set(rows, { all, shown });
  return shown;
}

export function shownRowsOf(state: CommanderSource, side: Side): ShownRows {
  const pane = state.view.panes[side];
  const query = filterOf(state, side) ?? '';
  if (pane?.flat !== undefined) {
    return flatShownRows(
      pane.rows,
      filterWords(query).length === 0 ? undefined : pane.flat.shown?.rows,
    );
  }
  return shownRowsIn(pane?.rows ?? noRows, query);
}

function startFlatWorker(): FlatWorker {
  return new Worker(new URL('flatWorker.js', location.href), {
    type: 'module',
  });
}

function flatPanesOf({ tab, panes, kept }: CommanderView): Set<string> {
  const flat = new Set<string>();
  const add = (
    each: string | undefined,
    sidesOf: Readonly<Record<Side, PaneView | undefined>>,
  ) => {
    for (const side of sides) {
      if (each !== undefined && sidesOf[side]?.flat !== undefined) {
        flat.add(filterKey(each, side));
      }
    }
  };
  add(tab, panes);
  for (const [each, away] of kept) {
    if (each !== tab) {
      add(each, away.panes);
    }
  }
  return flat;
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
      const { deleting, transferring, makingFolder } = get();
      if (makingFolder !== undefined && !stillShown(get().view, makingFolder)) {
        set({ makingFolder: undefined });
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
        const nearest =
          pane === undefined || pane.rows === before.panes[side]?.rows
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
          set((state) => ({ filters: withoutTab(state.filters, message.tab) }));
        }
      },
      request: post,
      listenViewer,
      findText: (tab, encoding, query, onFound) => {
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
      openRepository: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'openRepository', tab, side, folder, name }),
        ),
      folderCommand: (side, name, command) =>
        onPane(side, (tab, folder) =>
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
      drive: (side, drive) =>
        onTab((tab) => post({ type: 'drive', tab, side, drive })),
      listDrives: () => post({ type: 'listDrives' }),
      addBookmark: (side) =>
        onPane(side, (tab, folder) =>
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
        onPane(side, (tab, folder) =>
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
      askDelete: (side, names, permanently) =>
        onPane(side, (tab, folder) => {
          const binOff =
            !permanently && get().view.panes[side]?.binOff === true;
          set({
            deleting: {
              tab,
              side,
              folder,
              names,
              permanently: permanently || binOff,
              ...(binOff && { binOff }),
            },
          });
        }),
      confirmDelete: () => {
        const { deleting } = get();
        if (deleting !== undefined) {
          const { tab, side, folder, names, permanently } = deleting;
          set({ deleting: undefined });
          post({ type: 'delete', tab, side, folder, names, permanently });
        }
      },
      cancelDelete: () => set({ deleting: undefined }),
      askTransfer: (side, names, move) =>
        onPane(side, (tab, folder) => {
          const target = get().view.panes[otherSide(side)]?.folder;
          if (target !== undefined) {
            set({
              transferring: { tab, side, folder, names, target, move },
            });
          }
        }),
      confirmTransfer: () => {
        const { transferring } = get();
        if (transferring !== undefined) {
          set({ transferring: undefined });
          post({ type: 'transfer', ...transferring });
        }
      },
      cancelTransfer: () => set({ transferring: undefined }),
      copyToClipboard: (side, names) =>
        onPane(side, (tab, folder) =>
          post({ type: 'copyToClipboard', tab, side, folder, names }),
        ),
      dropOn: (side, files, into, move) =>
        onPane(side, (tab, folder) =>
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
        onPane(side, (tab, folder) =>
          post({ type: 'drag', tab, side, folder, names }),
        ),
      paste: (side) =>
        onPane(side, (tab, folder) =>
          post({ type: 'paste', tab, side, folder }),
        ),
      askNewFolder: (side) =>
        onPane(side, (tab, folder) =>
          set({ makingFolder: { tab, side, folder } }),
        ),
      makeFolder: (name) => {
        const { makingFolder } = get();
        if (makingFolder !== undefined) {
          set({ makingFolder: undefined });
          post({ type: 'newFolder', ...makingFolder, name });
        }
      },
      cancelNewFolder: () => set({ makingFolder: undefined }),
      answerClash: (answer, all) => {
        const { transfer } = get();
        if (transfer?.clash !== undefined) {
          post({
            type: 'answerClash',
            transfer: transfer.id,
            asked: transfer.clash.asked,
            answer,
            all,
          });
        }
      },
      stopTransfer: () => {
        const { transfer } = get();
        if (transfer !== undefined) {
          post({ type: 'stopTransfer', transfer: transfer.id });
        }
      },
      hideTransfer: () => {
        const { transfer } = get();
        if (transfer !== undefined) {
          post({ type: 'hideTransfer', transfer: transfer.id });
        }
      },
      elevate: () => {
        const { noAccess } = get();
        set({ noAccess: undefined });
        if (noAccess !== undefined) {
          onTab((tab) => post({ type: 'elevate', tab, side: noAccess.side }));
        }
      },
      closeNoAccess: () => set({ noAccess: undefined }),
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
      stopReading: (side) =>
        onTab((tab) => post({ type: 'stopReading', tab, side })),
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
