import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { CanvasToHost } from '../shared/protocol';
import { canvasViewSchema } from './tabView';
import { snapped } from './pan';
import {
  canvasDefaults,
  type CanvasActions,
  type CanvasSource,
  type CanvasState,
} from './state';

const hidden = { tab: undefined, file: undefined };

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

export function createCanvasStore(
  post: (message: CanvasToHost) => void,
  initial: Partial<CanvasSource> = {},
  views: ToolViews = noViews,
): StoreApi<CanvasState> {
  return createStore<CanvasState>()((set, get) => {
    const tabs = new TabLife(
      views,
      canvasViewSchema,
      {
        viewOf: (tab) => ({
          origin: get().origins.get(tab),
          selected: get().selections.get(tab),
        }),
        restore: (tab, { origin, selected }) => {
          set((state) => ({
            origins:
              origin === undefined
                ? without(state.origins, tab)
                : new Map(state.origins).set(tab, snapped(origin)),
            selections:
              selected === undefined
                ? without(state.selections, tab)
                : new Map(state.selections).set(tab, selected),
          }));
        },
        forget: (tab) => {
          set((state) => ({
            origins: without(state.origins, tab),
            selections: without(state.selections, tab),
          }));
        },
      },
      () => get().tab,
    );
    const actions: CanvasActions = {
      receive: (message) => {
        const leaving = get().tab;
        switch (message.type) {
          case 'show':
            tabs.showing(message.tab, leaving);
            set({ tab: message.tab, file: message.file });
            break;
          case 'hide':
            set({ ...hidden, placing: undefined });
            break;
          case 'closed': {
            const boards = new Map(get().boards);
            boards.delete(message.tab);
            set(get().tab === message.tab ? { ...hidden, boards } : { boards });
            tabs.closed(message.tab);
            break;
          }
          case 'board': {
            const { type: _type, tab, made, ...shown } = message;
            const ids = new Set(shown.board?.nodes.map((node) => node.id));
            const kept = (get().selections.get(tab) ?? []).filter((id) =>
              ids.has(id),
            );
            set((state) => ({
              boards: new Map(state.boards).set(tab, shown),
              selections: new Map(state.selections).set(
                tab,
                made === undefined ? kept : [made],
              ),
            }));
            tabs.changed(tab);
            break;
          }
          default:
            message satisfies never;
        }
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
        }
      },
      pan: (tab, origin) => {
        set((state) => ({ origins: new Map(state.origins).set(tab, origin) }));
        tabs.changed(tab);
      },
      originOf: (tab) => get().origins.get(tab),
      select: (tab, ids) => {
        set((state) => ({
          selections: new Map(state.selections).set(tab, ids),
        }));
        tabs.changed(tab);
      },
      selectedOf: (tab) => get().selections.get(tab) ?? [],
      place: (placing) => set({ placing }),
      edit: (tab, edit) => post({ type: 'edit', tab, edit }),
      undo: (tab) => post({ type: 'undo', tab }),
      redo: (tab) => post({ type: 'redo', tab }),
      save: (tab) => post({ type: 'save', tab }),
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...canvasDefaults, ...initial, ...actions };
  });
}

export const CanvasStore = createContext<StoreApi<CanvasState> | undefined>(
  undefined,
);

function useCanvasStore(): StoreApi<CanvasState> {
  const store = useContext(CanvasStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('canvas'));
  }
  return store;
}

export function useCanvas<T>(select: (state: CanvasState) => T): T {
  return useStore(useCanvasStore(), select);
}

export function useCanvasActions(): CanvasActions {
  return useCanvasStore().getState();
}
