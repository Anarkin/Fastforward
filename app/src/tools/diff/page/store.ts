import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import type { Infer } from '../../../lib/shared/schema';
import { withRecent } from '../../../lib/page/recentPlaces';
import { withEntry } from '../../../lib/page/tabKeyed';
import {
  textKey,
  type LoadedText,
} from '../../../components/diff/page/sideTexts';
import {
  diffPlaceKey,
  diffPlaceScopeOf,
} from '../../../components/diff/page/place';
import { diffSlice } from '../../../components/diff/page/slice';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { ComparedText, DiffToHost } from '../shared/protocol';
import { compareViewSchema, languageKeyOf } from './tabView';
import {
  compareDefaults,
  type CompareActions,
  type CompareSource,
  type CompareState,
  type ComparedVersions,
} from './state';

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
const noVersions: ComparedVersions = {};
const hidden = {
  tab: undefined,
  compare: undefined,
  texts: noTexts,
  versions: noVersions,
};

export function createDiffStore(
  post: (message: DiffToHost) => void,
  initial: Partial<CompareSource> = {},
  views: ToolViews = noViews,
): StoreApi<CompareState> {
  let life: TabLife<Infer<typeof compareViewSchema>> | undefined;
  const store = createStore<CompareState>()((set, get) => {
    const tabs = new TabLife(
      views,
      compareViewSchema,
      {
        viewOf: (tab) => {
          const { diffFinds, pickedLanguages, diffPlaces, focuses } = get();
          return {
            find: diffFinds.get(tab),
            place: diffPlaces.get(diffPlaceKey(tab, tab)),
            language: pickedLanguages.get(tab)?.language,
            focus: focuses.get(tab),
          };
        },
        restore: (tab, { find, place, language, focus }) => {
          set((state) => ({
            diffPlaces: withRecent(
              state.diffPlaces,
              diffPlaceKey(tab, tab),
              place,
            ),
            focuses: withRecent(state.focuses, tab, focus),
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
          set((state) => ({
            diffPlaces: withRecent(
              state.diffPlaces,
              diffPlaceKey(tab, tab),
              undefined,
            ),
            focuses: withRecent(state.focuses, tab, undefined),
            diffFinds: withEntry(state.diffFinds, tab, undefined),
            pickedLanguages: withEntry(state.pickedLanguages, tab, undefined),
          }));
        },
      },
      () => get().tab,
    );
    life = tabs;
    const actions: CompareActions = {
      ...diffSlice(set, get, post),
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
                versions: noVersions,
              }),
            }));
            break;
          case 'hide':
            set(hidden);
            break;
          case 'closed':
            if (get().tab === message.tab) {
              set(hidden);
            }
            tabs.closed(message.tab);
            break;
          case 'compare':
            if (message.compare.tab === get().tab) {
              set({ compare: message.compare });
            }
            break;
          case 'versions':
            if (message.tab === get().tab) {
              const { type: _type, tab: _tab, side, ...listed } = message;
              set((state) => ({
                versions: { ...state.versions, [side]: listed },
              }));
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
      chooseVersion: (side, rev) =>
        post({
          type: 'chooseVersion',
          side,
          ...(rev !== undefined && { rev }),
        }),
      focusOf: (tab) => get().focuses.get(tab),
      keepFocus: (tab, focus) =>
        set((state) => ({ focuses: withRecent(state.focuses, tab, focus) })),
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...compareDefaults, ...initial, ...actions };
  });
  store.subscribe((next, prev) => {
    for (const tab of new Set([
      ...changedKeys(next.diffFinds, prev.diffFinds),
      ...changedKeys(next.pickedLanguages, prev.pickedLanguages),
      ...changedKeys(next.focuses, prev.focuses),
      ...changedKeys(next.diffPlaces, prev.diffPlaces).map(diffPlaceScopeOf),
    ])) {
      if (tab !== undefined) {
        life?.changed(tab);
      }
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
