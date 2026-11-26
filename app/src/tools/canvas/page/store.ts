import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import { canvasViewSchema } from './tabView';
import {
  canvasDefaults,
  type CanvasActions,
  type CanvasSource,
  type CanvasState,
} from './state';

const hidden = { tab: undefined, file: undefined };

export function createCanvasStore(
  initial: Partial<CanvasSource> = {},
  views: ToolViews = noViews,
): StoreApi<CanvasState> {
  return createStore<CanvasState>()((set, get) => {
    const tabs = new TabLife(
      views,
      canvasViewSchema,
      { viewOf: () => ({}), restore: () => {}, forget: () => {} },
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
            set(hidden);
            break;
          case 'closed': {
            const boards = new Map(get().boards);
            boards.delete(message.tab);
            set(get().tab === message.tab ? { ...hidden, boards } : { boards });
            tabs.closed(message.tab);
            break;
          }
          case 'board': {
            const { type: _type, tab, ...shown } = message;
            set((state) => ({ boards: new Map(state.boards).set(tab, shown) }));
            break;
          }
          default:
            message satisfies never;
        }
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
        }
      },
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
