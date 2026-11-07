import { createStore, type StoreApi } from 'zustand';
import type {
  TerminalToHost,
  TerminalToWebview,
  TerminalToWebviewOf,
} from '../shared/protocol';

type TerminalSettings = Omit<TerminalToWebviewOf<'settings'>, 'type'>;

type ToScreen = TerminalToWebviewOf<'screen' | 'output' | 'exited'>;

export type FromScreen = Extract<
  TerminalToHost,
  { readonly type: 'open' | 'input' | 'resize' | 'ack' | 'restart' }
>;

export interface TerminalState {
  readonly shown: string | undefined;
  readonly settings: TerminalSettings | undefined;
  readonly folders: readonly string[];
  readonly receive: (message: TerminalToWebview) => void;
  readonly listenScreen: (handler: (message: ToScreen) => void) => () => void;
  readonly send: (message: FromScreen) => void;
  readonly newTab: () => void;
  readonly browseFolders: () => void;
  readonly openFolder: (folder: string) => void;
  readonly forgetFolder: (folder: string) => void;
}

export function createTerminalStore(
  post: (message: TerminalToHost) => void,
): StoreApi<TerminalState> {
  const screens = new Set<(message: ToScreen) => void>();
  return createStore<TerminalState>()((set) => ({
    shown: undefined,
    settings: undefined,
    folders: [],
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
