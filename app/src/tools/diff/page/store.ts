import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import type { Infer } from '../../../lib/shared/schema';
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
  let life: TabLife<Infer<typeof compareViewSchema>> | undefined;
  const places = new KeptPlaces<DiffPlace>(undefined, (key) => {
    const [tab]: unknown[] = JSON.parse(key);
    if (typeof tab === 'string') {
      life?.changed(tab);
    }
  });
  const store = createStore<CompareState>()((set, get) => {
    const focuses = new Map<string, KeptFocus>();
    const tabs = new TabLife(
      views,
      compareViewSchema,
      {
        viewOf: (tab) => {
          const { diffFinds, pickedLanguages } = get();
          return {
            find: diffFinds.get(tab),
            place: places.of(diffPlaceKey(tab, tab)),
            language: pickedLanguages.get(tab)?.language,
            focus: focuses.get(tab),
          };
        },
        restore: (tab, { find, place, language, focus }) => {
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
        },
        forget: (tab) => {
          places.forget(diffPlaceKey(tab, tab));
          focuses.delete(tab);
          set((state) => ({
            diffFinds: withEntry(state.diffFinds, tab, undefined),
            pickedLanguages: withEntry(state.pickedLanguages, tab, undefined),
          }));
        },
      },
      () => get().tab,
    );
    life = tabs;
    const actions: CompareActions = {
      ...diffSlice(set, get, places, post),
      receive: (message) => {
        const leaving = get().tab;
        switch (message.type) {
          case 'show':
            tabs.showing(message.tab, leaving);
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
            tabs.closed(message.tab);
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
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
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
        tabs.changed(tab);
      },
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...compareDefaults, ...initial, ...actions };
  });
  store.subscribe((next, prev) => {
    for (const tab of new Set([
      ...changedKeys(next.diffFinds, prev.diffFinds),
      ...changedKeys(next.pickedLanguages, prev.pickedLanguages),
    ])) {
      life?.changed(tab);
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
