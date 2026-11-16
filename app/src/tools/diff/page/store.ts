import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { ViewKeeper } from '../../../lib/page/viewKeeper';
import { KeptPlaces } from '../../../lib/page/keptPlaces';
import { withEntry } from '../../../lib/page/tabKeyed';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import {
  textKey,
  type LoadedText,
} from '../../../components/diff/page/sideTexts';
import {
  diffPlaceKey,
  type DiffPlace,
} from '../../../components/diff/page/diffPlace';
import { diffSlice } from '../../../components/diff/page/diffSlice';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ComparedText, DiffToHost } from '../shared/protocol';
import { compareViewSchema, languageKeyOf } from './tabView';
import {
  compareDefaults,
  type CompareActions,
  type CompareSource,
  type CompareState,
} from './diffState';

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

function changedKeys(
  next: ReadonlyMap<string, unknown>,
  prev: ReadonlyMap<string, unknown>,
): string[] {
  return next === prev
    ? []
    : [...new Set([...next.keys(), ...prev.keys()])].filter(
        (key) => next.get(key) !== prev.get(key),
      );
}

const noTexts: ReadonlyMap<string, LoadedText> = new Map();

export function createDiffStore(
  post: (message: DiffToHost) => void,
  initial: Partial<CompareSource> = {},
  views: ToolViews = noViews,
): StoreApi<CompareState> {
  let keeper: ViewKeeper | undefined;
  const places = new KeptPlaces<DiffPlace>(undefined, (key) => {
    const [tab]: unknown[] = JSON.parse(key);
    if (typeof tab === 'string') {
      keeper?.changed(tab);
    }
  });
  const store = createStore<CompareState>()((set, get) => {
    const known = new Set<string>();
    const shownWhenReleased = new Set<string>();
    const focuses = new Map<string, KeptFocus>();
    const viewOf = (tab: string) => {
      if (!known.has(tab)) {
        return undefined;
      }
      const { diffFinds, pickedLanguages } = get();
      const encoded = compareViewSchema.encode({
        find: diffFinds.get(tab),
        place: places.of(diffPlaceKey(tab, tab)),
        language: pickedLanguages.get(tab)?.language,
        focus: focuses.get(tab),
      });
      return encoded === undefined ? undefined : JSON.stringify(encoded);
    };
    const kept = new ViewKeeper(views, viewOf, () => get().tab);
    keeper = kept;
    const restore = (tab: string, view: string) => {
      const decoded = compareViewSchema.decode(parsedOf(view));
      if (decoded === undefined) {
        return;
      }
      const { find, place, language, focus } = decoded;
      if (place === undefined) {
        places.forget(diffPlaceKey(tab, tab));
      } else {
        places.keep(diffPlaceKey(tab, tab), place);
      }
      if (focus === undefined) {
        focuses.delete(tab);
      } else {
        focuses.set(tab, focus);
      }
      set((state) => ({
        diffFinds: withEntry(state.diffFinds, tab, find),
        pickedLanguages: withEntry(
          state.pickedLanguages,
          tab,
          language === undefined
            ? undefined
            : { key: languageKeyOf(tab), language },
        ),
      }));
    };
    const letGo = (tab: string) => {
      known.delete(tab);
      kept.forget(tab);
      places.forget(diffPlaceKey(tab, tab));
      focuses.delete(tab);
      set((state) => ({
        diffFinds: withEntry(state.diffFinds, tab, undefined),
        pickedLanguages: withEntry(state.pickedLanguages, tab, undefined),
      }));
    };
    const actions: CompareActions = {
      ...diffSlice(set, get, places, post),
      receive: (message) => {
        const leaving = get().tab;
        switch (message.type) {
          case 'show':
            known.add(message.tab);
            if (leaving !== message.tab) {
              const handed = kept.handed(message.tab);
              if (handed !== undefined) {
                restore(message.tab, handed);
              }
            }
            set((state) => ({
              tab: message.tab,
              ...message.settings,
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
            kept.left(leaving);
          }
        }
      },
      loadTexts: (requests) => post({ type: 'loadTexts', requests }),
      focusOf: (tab) => focuses.get(tab),
      keepFocus: (tab, focus) => {
        if (focus === undefined) {
          focuses.delete(tab);
        } else {
          focuses.set(tab, focus);
        }
        kept.changed(tab);
      },
      keepTabs: () => kept.flush(),
      releaseTab: (tab) => {
        if (!known.has(tab)) {
          return undefined;
        }
        const view = kept.release(tab);
        if (get().tab === tab) {
          shownWhenReleased.add(tab);
        } else {
          letGo(tab);
        }
        return view;
      },
    };
    return { ...compareDefaults, ...initial, ...actions };
  });
  store.subscribe((next, prev) => {
    for (const tab of new Set([
      ...changedKeys(next.diffFinds, prev.diffFinds),
      ...changedKeys(next.pickedLanguages, prev.pickedLanguages),
    ])) {
      keeper?.changed(tab);
    }
  });
  return store;
}

export const DiffStore = createContext<StoreApi<CompareState> | undefined>(
  undefined,
);

export function useDiffStore(): StoreApi<CompareState> {
  const store = useContext(DiffStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('diff'));
  }
  return store;
}

export function useDiff<T>(select: (state: CompareState) => T): T {
  return useStore(useDiffStore(), select);
}

export function useDiffActions(): CompareActions {
  return useDiffStore().getState();
}
