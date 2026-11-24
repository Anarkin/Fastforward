import { createStore, type StoreApi } from 'zustand';
import {
  plainSearch,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import type {
  TerminalToHost,
  TerminalToWebview,
  TerminalToWebviewOf,
} from '../shared/protocol';

type TerminalSettings = Omit<TerminalToWebviewOf<'settings'>, 'type'>;

type ToScreen = TerminalToWebviewOf<'screen' | 'output' | 'exited'>;

export type FromScreen = Extract<
  TerminalToHost,
  {
    readonly type:
      'open' | 'input' | 'resize' | 'ack' | 'restart' | 'scrolled' | 'selected';
  }
>;

interface TerminalFind {
  readonly query: string;
  readonly options: SearchOptions;
  readonly found: MatchesFound;
}

const nothingFound: MatchesFound = { current: 0, matches: 0 };

export interface TerminalState {
  readonly shown: string | undefined;
  readonly settings: TerminalSettings | undefined;
  readonly folders: readonly string[];
  readonly finds: ReadonlyMap<string, TerminalFind>;
  readonly openFind: (tab: string, selected: string) => void;
  readonly findFor: (
    tab: string,
    query: string,
    options: SearchOptions,
  ) => void;
  readonly foundFor: (tab: string, found: MatchesFound) => void;
  readonly closeFind: (tab: string) => void;
  readonly receive: (message: TerminalToWebview) => void;
  readonly listenScreen: (handler: (message: ToScreen) => void) => () => void;
  readonly send: (message: FromScreen) => void;
  readonly newTab: () => void;
  readonly browseFolders: () => void;
  readonly openFolder: (folder: string) => void;
  readonly forgetFolder: (folder: string) => void;
}

function withFind(
  finds: ReadonlyMap<string, TerminalFind>,
  tab: string,
  change: (find: TerminalFind) => TerminalFind,
): ReadonlyMap<string, TerminalFind> {
  const find = finds.get(tab);
  return find === undefined ? finds : new Map(finds).set(tab, change(find));
}

export function createTerminalStore(
  post: (message: TerminalToHost) => void,
): StoreApi<TerminalState> {
  const screens = new Set<(message: ToScreen) => void>();
  return createStore<TerminalState>()((set) => ({
    shown: undefined,
    settings: undefined,
    folders: [],
    finds: new Map(),
    openFind: (tab, selected) =>
      set((state) => {
        const kept = state.finds.get(tab);
        return {
          finds: new Map(state.finds).set(tab, {
            query: selected !== '' ? selected : (kept?.query ?? ''),
            options: kept?.options ?? plainSearch,
            found: kept?.found ?? nothingFound,
          }),
        };
      }),
    findFor: (tab, query, options) =>
      set((state) => ({
        finds: withFind(state.finds, tab, (find) => ({
          ...find,
          query,
          options,
        })),
      })),
    foundFor: (tab, found) =>
      set((state) => ({
        finds: withFind(state.finds, tab, (find) => ({ ...find, found })),
      })),
    closeFind: (tab) =>
      set((state) => {
        const finds = new Map(state.finds);
        finds.delete(tab);
        return { finds };
      }),
    receive: (message) => {
      switch (message.type) {
        case 'settings':
          set({
            settings: {
              renderer: message.renderer,
              scrollback: message.scrollback,
              minimumContrastRatio: message.minimumContrastRatio,
              windowsPty: message.windowsPty,
            },
          });
          return;
        case 'show':
          set({ shown: message.tab });
          return;
        case 'hide':
          set({ shown: undefined });
          return;
        case 'folders':
          set({ folders: message.folders });
          return;
        default:
          for (const screen of screens) {
            screen(message);
          }
      }
    },
    listenScreen: (handler) => {
      screens.add(handler);
      return () => {
        screens.delete(handler);
      };
    },
    send: post,
    newTab: () => post({ type: 'newTab' }),
    browseFolders: () => post({ type: 'browseFolders' }),
    openFolder: (folder) => post({ type: 'openFolder', folder }),
    forgetFolder: (folder) => {
      set((state) => ({
        folders: state.folders.filter((other) => other !== folder),
      }));
      post({ type: 'forgetFolder', folder });
    },
  }));
}
