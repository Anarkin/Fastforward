import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ViewerToHost } from '../shared/protocol';
import { viewerActions } from './viewerActions';
import { noSearch } from '../../../lib/shared/searchOptions';
import { noKeptViewer, withoutCaches } from './viewerKept';
import { viewerViewSchema } from './tabView';
import {
  choicesOf,
  viewerDefaults,
  type ViewerActions,
  type ViewerChoices,
  type ViewerSource,
  type ViewerState,
} from './viewerState';
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
            choices: choices.get(tab),
          };
        },
        restore: (tab, { choices, place, ...view }) => {
          viewer.freshCache(tab);
          set((state) => ({
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
            }),
          }));
        },
        forget: (tab) => {
          viewer.forget(tab);
          set((state) => ({
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
              viewed:
                state.tab === message.tab && state.file === message.file
                  ? state.viewed
                  : state.keptViewed.get(message.tab),
            }));
            break;
          }
          case 'hide':
            viewer.awaitViewing(undefined);
            set({ tab: undefined, file: undefined, viewed: undefined });
            break;
          case 'closed':
            if (get().tab === message.tab) {
              set({ tab: undefined, file: undefined, viewed: undefined });
            }
            tabs.closed(message.tab);
            break;
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
        ...viewer.cacheOf(tab),
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
        viewer.keepCache(tab, change);
        changed(tab);
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
