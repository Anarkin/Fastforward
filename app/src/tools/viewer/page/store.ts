import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ViewerToHost } from '../shared/protocol';
import { viewerActions } from './actions';
import { noSearch } from '../../../lib/shared/searchOptions';
import {
  cachesOf,
  maxCachedViewers,
  noKeptViewer,
  withoutCaches,
} from './tabParts';
import { viewerViewSchema } from './tabView';
import {
  choicesOf,
  viewerDefaults,
  type ViewerActions,
  type ViewerChoices,
  type ViewerSource,
  type ViewerState,
} from './state';
import { isViewerStream, sameViewing, viewingOf } from './viewing';

function without<T>(
  map: ReadonlyMap<string, T>,
  tab: string,
): ReadonlyMap<string, T> {
  if (!map.has(tab)) {
    return map;
  }
  const next = new Map(map);
  next.delete(tab);
  return next;
}

function recentFirst<T>(
  map: ReadonlyMap<string, T>,
  tab: string,
  value: T,
): ReadonlyMap<string, T> {
  const next = new Map(map);
  next.delete(tab);
  next.set(tab, value);
  for (const oldest of next.keys()) {
    if (next.size <= maxCachedViewers) {
      break;
    }
    next.delete(oldest);
  }
  return next;
}

export function createViewerStore(
  post: (message: ViewerToHost) => void,
  initial: Partial<ViewerSource> = {},
  views: ToolViews = noViews,
): StoreApi<ViewerState> {
  return createStore<ViewerState>()((set, get) => {
    const viewer = viewerActions(post);
    const tabs = new TabLife(
      views,
      viewerViewSchema,
      {
        viewOf: (tab) => {
          const { choices, tabViews, places } = get();
          const view = tabViews.get(tab) ?? noKeptViewer;
          return {
            place: places.get(tab),
            finding: view.finding,
            search: view.search,
            current: view.current,
            focus: view.focus,
            sideways: view.sideways,
            preview: view.preview,
            pdfFind: view.pdfFind,
            markdownFind: view.markdownFind,
            choices: choices.get(tab),
          };
        },
        restore: (tab, { choices, place, ...view }) => {
          set((state) => ({
            caches: state.caches.has(tab)
              ? new Map(state.caches).set(tab, {})
              : state.caches,
            choices:
              choices === undefined
                ? without(state.choices, tab)
                : new Map(state.choices).set(tab, choices),
            places:
              place === undefined
                ? without(state.places, tab)
                : new Map(state.places).set(tab, place),
            tabViews: new Map(state.tabViews).set(tab, {
              finding: view.finding ?? false,
              search: view.search ?? noSearch,
              current: view.current ?? 0,
              focus: view.focus,
              sideways: view.sideways,
              preview: view.preview,
              pdfFind: view.pdfFind,
              markdownFind: view.markdownFind,
              selected: view.selected,
            }),
          }));
        },
        forget: (tab) => {
          set((state) => ({
            caches: without(state.caches, tab),
            keptViewed: without(state.keptViewed, tab),
            choices: without(state.choices, tab),
            tabViews: without(state.tabViews, tab),
            places: without(state.places, tab),
          }));
        },
      },
      () => get().tab,
    );
    const changed = (tab: string) => tabs.changed(tab);
    const actions: ViewerActions = {
      ...viewer.actions,
      receive: (message) => {
        if (isViewerStream(message)) {
          viewer.heard(message);
          return;
        }
        const leaving = get().tab;
        switch (message.type) {
          case 'show': {
            tabs.showing(message.tab, leaving);
            viewer.awaitViewing(message.tab);
            set((state) => ({
              tab: message.tab,
              file: message.file,
              version: message.version,
              caches: recentFirst(
                state.caches,
                message.tab,
                state.caches.get(message.tab) ?? {},
              ),
              viewed:
                state.tab !== message.tab
                  ? state.keptViewed.get(message.tab)
                  : state.file === message.file &&
                      state.version === message.version
                    ? state.viewed
                    : undefined,
            }));
            const { at, encoding } = message;
            if (at !== undefined) {
              set((state) => ({
                places: new Map(state.places).set(message.tab, at),
                ...(encoding !== undefined && {
                  choices: new Map(state.choices).set(message.tab, {
                    ...state.choices.get(message.tab),
                    encoding,
                  }),
                }),
              }));
              changed(message.tab);
            }
            break;
          }
          case 'hide':
            viewer.awaitViewing(undefined);
            set({
              tab: undefined,
              file: undefined,
              version: undefined,
              viewed: undefined,
            });
            break;
          case 'closed':
            if (get().tab === message.tab) {
              set({
                tab: undefined,
                file: undefined,
                version: undefined,
                viewed: undefined,
              });
            }
            set((state) => ({
              versions: without(state.versions, message.tab),
            }));
            tabs.closed(message.tab);
            break;
          case 'versions': {
            set((state) => ({
              versions: new Map(state.versions).set(message.tab, {
                versions: message.versions,
                staged: message.staged,
                changed: message.changed,
                onDisk: message.onDisk,
              }),
            }));
            break;
          }
          case 'viewing': {
            const viewed = viewingOf(message);
            if (!sameViewing(get().viewed, viewed)) {
              set((state) => ({
                viewed,
                keptViewed: new Map(state.keptViewed).set(viewed.tab, viewed),
              }));
            }
            viewer.viewingCame(message.tab);
            break;
          }
        }
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
        }
      },
      choose: (choices: Partial<ViewerChoices>) => {
        const { tab } = get();
        if (tab === undefined) {
          return;
        }
        set((state) => ({
          choices: new Map(state.choices).set(tab, {
            ...choicesOf(state),
            ...choices,
          }),
        }));
        changed(tab);
      },
      chooseVersion: (rev) => {
        const { tab } = get();
        if (tab !== undefined) {
          post({
            type: 'chooseVersion',
            tab,
            ...(rev !== undefined && { rev }),
          });
        }
      },
      compareVersions: () => {
        const { tab } = get();
        if (tab !== undefined) {
          post({ type: 'compareVersions', tab });
        }
      },
      editViewed: (tab, at, encoding) =>
        post({
          type: 'editViewed',
          tab,
          at,
          ...(encoding !== undefined && { encoding }),
        }),
      placeOf: (tab) => get().places.get(tab) ?? 0,
      keepPlace: (tab, byte) => {
        if (get().places.get(tab) !== byte) {
          set((state) => ({ places: new Map(state.places).set(tab, byte) }));
        }
        changed(tab);
      },
      keptViewer: (tab) => ({
        ...noKeptViewer,
        ...get().tabViews.get(tab),
        ...get().caches.get(tab),
      }),
      keepViewer: (tab, change) => {
        const view = withoutCaches(change);
        if (Object.keys(view).length > 0) {
          set((state) => ({
            tabViews: new Map(state.tabViews).set(tab, {
              ...noKeptViewer,
              ...state.tabViews.get(tab),
              ...view,
            }),
          }));
        }
        const cached = cachesOf(change);
        if (Object.keys(cached).length > 0) {
          set((state) => {
            const held = state.caches.get(tab);
            return held === undefined
              ? state
              : {
                  caches: new Map(state.caches).set(tab, {
                    ...held,
                    ...cached,
                  }),
                };
          });
        }
        if (Object.keys(view).length > 0) {
          changed(tab);
        }
      },
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...viewerDefaults, ...initial, ...actions };
  });
}

export const ViewerStore = createContext<StoreApi<ViewerState> | undefined>(
  undefined,
);

function useViewerStore(): StoreApi<ViewerState> {
  const store = useContext(ViewerStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('viewer'));
  }
  return store;
}

export function useViewer<T>(select: (state: ViewerState) => T): T {
  return useStore(useViewerStore(), select);
}

export function useViewerActions(): ViewerActions {
  return useViewerStore().getState();
}
