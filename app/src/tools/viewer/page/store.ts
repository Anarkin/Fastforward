import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ViewerToHost } from '../shared/protocol';
import { viewerActions } from './viewerActions';
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
        viewOf: (tab) => ({
          ...viewer.kept(tab),
          choices: get().choices.get(tab),
        }),
        restore: (tab, { choices, ...rest }) => {
          set((state) => ({
            choices:
              choices === undefined
                ? without(state.choices, tab)
                : new Map(state.choices).set(tab, choices),
          }));
          viewer.restore(tab, rest);
        },
        forget: (tab) => {
          viewer.forget(tab);
          set((state) => ({
            keptViewed: without(state.keptViewed, tab),
            choices: without(state.choices, tab),
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
      keepPlace: (tab, byte) => {
        viewer.actions.keepPlace(tab, byte);
        changed(tab);
      },
      keepViewer: (tab, change) => {
        viewer.actions.keepViewer(tab, change);
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
