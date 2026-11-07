import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../shared/strings';
import { maxDroppedIcons } from '../shared/icons';
import type {
  CommanderToHost,
  CommanderToWebview,
  Side,
} from '../shared/protocol';
import type {
  ColumnWidths,
  Layout,
  SizedColumn,
  SortColumn,
} from '../shared/settings';
import { filesToCompare } from './comparing';
import { nextSort } from './listing';
import {
  emptyView,
  reduceView,
  type CommanderView,
  type ViewAction,
  type ViewerChoices,
} from './view';
import type { ToViewer, Viewing } from './viewer';
import { ScrollPlaces } from './scrollPlaces';

export type ViewerRequest = Extract<
  CommanderToHost,
  {
    readonly type:
      | 'readText'
      | 'readRows'
      | 'readBytes'
      | 'findText'
      | 'readPdfPlace'
      | 'savePdfPlace';
  }
>;

interface Deleting {
  readonly tab: string;
  readonly side: Side;
  readonly names: readonly string[];
  readonly permanently: boolean;
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
  readonly noAccess: NoAccess | undefined;
  readonly resized:
    { readonly from: ColumnWidths; readonly widths: ColumnWidths } | undefined;
}

interface CommanderActions {
  readonly receive: (message: CommanderToWebview) => void;
  readonly request: (message: ViewerRequest) => void;
  readonly listenViewer: (handler: (message: ToViewer) => void) => () => void;
  readonly dispatch: (action: ViewAction) => void;
  readonly select: (side: Side, key: string) => void;
  readonly mark: (side: Side, keys: readonly string[], marked: boolean) => void;
  readonly activate: (side: Side) => void;
  readonly switchSide: () => void;
  readonly chooseLayout: (side: Side, layout: Layout) => void;
  readonly choose: (choices: ViewerChoices) => void;
  readonly sort: (side: Side, column: SortColumn) => void;
  readonly groupByColor: (side: Side) => void;
  readonly open: (side: Side, name: string) => void;
  readonly step: (side: Side, step: -1 | 1) => void;
  readonly viewFile: (side: Side, name: string) => void;
  readonly openRepository: (side: Side, name: string) => void;
  readonly openOnSide: (from: Side, side: Side, name: string) => void;
  readonly drive: (side: Side, drive: string) => void;
  readonly listDrives: () => void;
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
  readonly elevate: () => void;
  readonly closeNoAccess: () => void;
  readonly resizeColumn: (column: SizedColumn, width: number) => void;
  readonly saveColumn: (column: SizedColumn, width: number) => void;
  readonly resetColumn: (column: SizedColumn) => void;
  readonly dropIcon: (ticket: string) => void;
  readonly scrollOf: (key: string) => number;
  readonly keepScroll: (key: string, offset: number) => void;
  readonly saveThumbnail: (
    side: Side,
    name: string,
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
  noAccess: undefined,
  resized: undefined,
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
    case 'viewing':
      return { viewed: viewedOf(message) };
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

export function createCommanderStore(
  post: (message: CommanderToHost) => void,
  initial: Partial<CommanderSource> = {},
): StoreApi<CommanderState> {
  const dropped: string[] = [];
  const scrolls = new ScrollPlaces();
  const viewerListeners = new Set<(message: ToViewer) => void>();
  const saveColumns = (columns: ColumnWidths) =>
    post({ type: 'columns', columns });
  return createStore<CommanderState>()((set, get) => {
    const announced = (change: () => void) => {
      const before = get().view;
      change();
      const { tab, active } = get().view;
      if (
        tab !== undefined &&
        (tab !== before.tab || active !== before.active)
      ) {
        post({ type: 'activate', tab, side: active });
      }
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
        announced(() => set((state) => received(state, message)));
      },
      request: post,
      listenViewer: (handler) => {
        viewerListeners.add(handler);
        return () => {
          viewerListeners.delete(handler);
        };
      },
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
        onTab((tab) => post({ type: 'open', tab, side, name })),
      step: (side, step) =>
        onTab((tab) => post({ type: 'step', tab, side, step })),
      viewFile: (side, name) =>
        onTab((tab) => post({ type: 'view', tab, side, name })),
      openRepository: (side, name) =>
        onTab((tab) => post({ type: 'openRepository', tab, side, name })),
      openOnSide: (from, side, name) =>
        onTab((tab) => post({ type: 'openOnSide', tab, from, side, name })),
      drive: (side, drive) =>
        onTab((tab) => post({ type: 'drive', tab, side, drive })),
      listDrives: () => post({ type: 'listDrives' }),
      reread: () =>
        onTab((tab) => post({ type: 'reread', tab, side: get().view.active })),
      toggleHidden: () =>
        post({ type: 'showHidden', shown: !get().view.showHidden }),
      compare: () =>
        onTab((tab) => {
          const { active, panes } = get().view;
          const files = filesToCompare(active, panes);
          if (files !== undefined) {
            post({ type: 'compare', tab, files });
          }
        }),
      shellMenu: (side, names, at, extended) =>
        onTab((tab) =>
          post({
            type: 'shellMenu',
            tab,
            side,
            names,
            x: at.x,
            y: at.y,
            extended,
          }),
        ),
      askDelete: (side, names, permanently) =>
        onTab((tab) => set({ deleting: { tab, side, names, permanently } })),
      confirmDelete: () => {
        const { deleting } = get();
        if (deleting !== undefined) {
          set({ deleting: undefined });
          post({ type: 'delete', ...deleting });
        }
      },
      cancelDelete: () => set({ deleting: undefined }),
      elevate: () => {
        const { noAccess } = get();
        set({ noAccess: undefined });
        if (noAccess !== undefined) {
          onTab((tab) => post({ type: 'elevate', tab, side: noAccess.side }));
        }
      },
      closeNoAccess: () => set({ noAccess: undefined }),
      resizeColumn: (column, width) =>
        set((state) => ({
          resized: {
            from: state.view.columns,
            widths: { ...shownColumns(state), [column]: width },
          },
        })),
      saveColumn: (column, width) =>
        saveColumns({ ...get().view.columns, [column]: width }),
      resetColumn: (column) => {
        const { columns, defaultColumns } = get().view;
        saveColumns({ ...columns, [column]: defaultColumns[column] });
      },
      scrollOf: (key) => scrolls.of(key),
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
      saveThumbnail: async (side, name, box, pixelRatio, made) => {
        const { tab, panes } = get().view;
        const folder = panes[side]?.folder;
        if (tab === undefined || folder === undefined) {
          return;
        }
        const bytes = new Uint8Array(await made.arrayBuffer());
        post({
          type: 'saveThumbnail',
          tab,
          side,
          folder,
          name,
          box,
          pixelRatio,
          bytes,
        });
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
