import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { ViewKeeper } from '../../../lib/page/viewKeeper';
import { textKey, type LoadedText } from '../../../lib/page/sideTexts';
import {
  withSnap,
  withText,
  withWrapColumns,
} from '../../../lib/page/diffMeasures';
import { unplaced, type DiffPlace } from '../../../lib/page/diffPlace';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ComparedText, DiffToHost } from '../shared/protocol';
import { diffViewSchema } from './tabView';
import {
  diffDefaults,
  type DiffActions,
  type DiffSource,
  type DiffState,
} from './diffState';

function withEntry<T>(
  map: ReadonlyMap<string, T>,
  tab: string,
  value: T | undefined,
): ReadonlyMap<string, T> {
  if (value === undefined ? !map.has(tab) : map.get(tab) === value) {
    return map;
  }
  const next = new Map(map);
  if (value === undefined) {
    next.delete(tab);
  } else {
    next.set(tab, value);
  }
  return next;
}

function withTexts(
  texts: ReadonlyMap<string, LoadedText>,
  loaded: readonly ComparedText[],
): ReadonlyMap<string, LoadedText> {
  const known = new Map(texts);
  for (const each of loaded) {
    known.set(textKey(each.path, each.side), {
      blob: each.blob,
      text: each.text,
    });
  }
  return known;
}

function parsedOf(view: string): unknown {
  try {
    return JSON.parse(view);
  } catch {
    return undefined;
  }
}

const noTexts: ReadonlyMap<string, LoadedText> = new Map();

export function createDiffStore(
  post: (message: DiffToHost) => void,
  initial: Partial<DiffSource> = {},
  views: ToolViews = noViews,
): StoreApi<DiffState> {
  return createStore<DiffState>()((set, get) => {
    const known = new Set<string>();
    const shownWhenReleased = new Set<string>();
    const places = new Map<string, DiffPlace>();
    const focuses = new Map<string, KeptFocus>();
    const viewOf = (tab: string) => {
      if (!known.has(tab)) {
        return undefined;
      }
      const { finds, languages } = get();
      const encoded = diffViewSchema.encode({
        find: finds.get(tab),
        place: places.get(tab),
        language: languages.get(tab),
        focus: focuses.get(tab),
      });
      return encoded === undefined ? undefined : JSON.stringify(encoded);
    };
    const keeper = new ViewKeeper(views, viewOf, () => get().tab);
    const restore = (tab: string, view: string) => {
      const kept = diffViewSchema.decode(parsedOf(view));
      if (kept === undefined) {
        return;
      }
      const { find, place, language, focus } = kept;
      if (place === undefined) {
        places.delete(tab);
      } else {
        places.set(tab, place);
      }
      if (focus === undefined) {
        focuses.delete(tab);
      } else {
        focuses.set(tab, focus);
      }
      set((state) => ({
        finds: withEntry(state.finds, tab, find),
        languages: withEntry(state.languages, tab, language),
      }));
    };
    const letGo = (tab: string) => {
      known.delete(tab);
      keeper.forget(tab);
      places.delete(tab);
      focuses.delete(tab);
      set((state) => ({
        finds: withEntry(state.finds, tab, undefined),
        languages: withEntry(state.languages, tab, undefined),
      }));
    };
    const actions: DiffActions = {
      receive: (message) => {
        const leaving = get().tab;
        switch (message.type) {
          case 'show':
            known.add(message.tab);
            if (leaving !== message.tab) {
              const handed = keeper.handed(message.tab);
              if (handed !== undefined) {
                restore(message.tab, handed);
              }
            }
            set((state) => ({
              tab: message.tab,
              settings: message.settings,
              ...(state.tab !== message.tab && {
                compare: undefined,
                texts: noTexts,
              }),
            }));
            break;
          case 'hide':
            set({ tab: undefined, compare: undefined, texts: noTexts });
            break;
          case 'closed':
            if (get().tab === message.tab) {
              set({ tab: undefined, compare: undefined, texts: noTexts });
            }
            shownWhenReleased.delete(message.tab);
            letGo(message.tab);
            break;
          case 'compare':
            if (message.compare.tab === get().tab) {
              set({ compare: message.compare });
            }
            break;
          case 'texts':
            if (message.tab === get().tab) {
              set((state) => ({
                texts: withTexts(state.texts, message.texts),
              }));
            }
            break;
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
      loadTexts: (requests) => post({ type: 'loadTexts', requests }),
      setShowEntireFile: (show) => {
        set((state) => ({
          settings: { ...state.settings, showEntireFile: show },
        }));
        post({ type: 'setShowEntireFile', show });
      },
      setIgnoreWhitespace: (ignore) => {
        set((state) => ({
          settings: { ...state.settings, ignoreWhitespace: ignore },
        }));
        post({ type: 'setIgnoreWhitespace', ignore });
      },
      setDiffLayout: (layout) => {
        set((state) => ({
          settings: { ...state.settings, diffLayout: layout },
        }));
        post({ type: 'setDiffLayout', layout });
      },
      keepFind: (tab, find) => {
        set((state) => ({ finds: withEntry(state.finds, tab, find) }));
        keeper.changed(tab);
      },
      closeFind: (tab) => {
        const find = get().finds.get(tab);
        if (find !== undefined) {
          set((state) => ({
            finds: withEntry(state.finds, tab, {
              finding: false,
              search: { query: '', options: find.search.options },
            }),
          }));
          keeper.changed(tab);
        }
      },
      placeOf: (tab) => places.get(tab),
      keepPlace: (tab, change) => {
        const place = { ...(places.get(tab) ?? unplaced), ...change };
        places.set(tab, {
          ...place,
          ...(change.current !== undefined && {
            currentFor: get().finds.get(tab)?.search,
          }),
        });
        keeper.changed(tab);
      },
      pickLanguage: (tab, language) => {
        set((state) => ({
          languages: withEntry(state.languages, tab, language),
        }));
        keeper.changed(tab);
      },
      focusOf: (tab) => focuses.get(tab),
      keepFocus: (tab, focus) => {
        if (focus === undefined) {
          focuses.delete(tab);
        } else {
          focuses.set(tab, focus);
        }
        keeper.changed(tab);
      },
      measureText: (measures) =>
        set((state) => ({ measures: withText(state.measures, measures) })),
      snapCode: (snap) =>
        set((state) => ({ measures: withSnap(state.measures, snap) })),
      keepWrapColumns: (columns) =>
        set((state) => ({
          measures: withWrapColumns(state.measures, columns),
        })),
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
    return { ...diffDefaults, ...initial, ...actions };
  });
}

export const DiffStore = createContext<StoreApi<DiffState> | undefined>(
  undefined,
);

function useDiffStore(): StoreApi<DiffState> {
  const store = useContext(DiffStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('diff'));
  }
  return store;
}

export function useDiff<T>(select: (state: DiffState) => T): T {
  return useStore(useDiffStore(), select);
}

export function useDiffActions(): DiffActions {
  return useDiffStore().getState();
}
