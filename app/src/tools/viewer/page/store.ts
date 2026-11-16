import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { ViewKeeper } from '../../../lib/page/viewKeeper';
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

function parsedOf(view: string): unknown {
  try {
    return JSON.parse(view);
  } catch {
    return undefined;
  }
}

export function createViewerStore(
  post: (message: ViewerToHost) => void,
  initial: Partial<ViewerSource> = {},
  views: ToolViews = noViews,
): StoreApi<ViewerState> {
  return createStore<ViewerState>()((set, get) => {
    const viewer = viewerActions(post);
    const known = new Set<string>();
    const shownWhenReleased = new Set<string>();
    const viewOf = (tab: string) => {
      if (!known.has(tab)) {
        return undefined;
      }
      const encoded = viewerViewSchema.encode({
        ...viewer.kept(tab),
        choices: get().choices.get(tab),
      });
      return encoded === undefined ? undefined : JSON.stringify(encoded);
    };
    const keeper = new ViewKeeper(views, viewOf, () => get().tab);
    const restore = (tab: string, view: string) => {
      const kept = viewerViewSchema.decode(parsedOf(view));
      if (kept === undefined) {
        return;
      }
      const { choices, ...rest } = kept;
      set((state) => ({
        choices:
          choices === undefined
            ? without(state.choices, tab)
            : new Map(state.choices).set(tab, choices),
      }));
      viewer.restore(tab, rest);
    };
    const forget = (tab: string) => {
      viewer.forget(tab);
      set((state) => ({
        keptViewed: without(state.keptViewed, tab),
        choices: without(state.choices, tab),
      }));
    };
    const letGo = (tab: string) => {
      known.delete(tab);
      keeper.forget(tab);
      forget(tab);
    };
    const changed = (tab: string) => keeper.changed(tab);
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
            known.add(message.tab);
            if (leaving !== message.tab) {
              const handed = keeper.handed(message.tab);
              if (handed !== undefined) {
                restore(message.tab, handed);
              }
            }
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
            shownWhenReleased.delete(message.tab);
            letGo(message.tab);
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
        if (
          (message.type === 'show' || message.type === 'hide') &&
          leaving !== undefined &&
          leaving !== get().tab
        ) {
          if (shownWhenReleased.delete(leaving)) {
            letGo(leaving);
          } else {
            keeper.left(leaving);
          }
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
      keepTabs: () => keeper.flush(),
      releaseTab: (tab) => {
        if (!known.has(tab)) {
          return undefined;
        }
        const view = keeper.release(tab);
        if (get().tab === tab) {
          shownWhenReleased.add(tab);
        } else {
          letGo(tab);
        }
        return view;
      },
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
