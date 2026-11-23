import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../lib/shared/strings';
import type { ToHost } from '../shared/protocol';
import { confirmsClose, type ToolId } from '../shared/tools';
import { movedTab } from './tabDrag';
import { closingOf } from './confirming';
import { toolChannels } from './toolChannels';
import {
  shellDefaults,
  type ShellActions,
  type ShellSource,
  type ShellState,
} from './state';
import { received } from './received';
import { withPopup } from './popups';
import { nextMenu } from './openedMenu';
import { lookAsker } from './lookAsker';
import { pathMenuAsks } from './pathMenuAsks';

export function createShellStore(
  post: (message: ToHost) => void,
  initial: Partial<ShellSource> = {},
  dropFiles: (
    files: readonly File[],
    tool: ToolId,
    message: unknown,
  ) => void = () => {},
  platform: () => string | undefined = () =>
    typeof document === 'undefined'
      ? undefined
      : document.documentElement.dataset.platform,
): StoreApi<ShellState> {
  let noticesShown = 0;
  const { channels, deliver, views } = toolChannels(post, dropFiles);
  const askLooks = lookAsker((paths) => post({ type: 'partLooks', paths }));
  const pathMenus = pathMenuAsks(post, platform);
  return createStore<ShellState>()((set, get) => {
    return {
      ...shellDefaults,
      ...initial,
      receive: (message) => {
        if (message.type === 'tool') {
          deliver(message.tool, message.message);
        } else if (message.type === 'view') {
          views.handed(message.tab, message.view);
        } else if (message.type === 'release') {
          views.release(message.tab);
        } else if (message.type === 'pathFacts') {
          const menu = pathMenus.answered(message.ask, message.facts);
          if (menu !== undefined) {
            set({ pathMenu: { id: message.ask, menu } });
          }
        } else {
          if (message.type === 'tabs') {
            views.held(message.tabs.map((tab) => tab.id));
          }
          set((state) => received(state, message, () => ++noticesShown));
        }
      },
      channels,
      dismissNotice: (id) =>
        set((state) => ({
          notices: state.notices.filter((notice) => notice.id !== id),
        })),
      restartNotices: (ids) =>
        set((state) => {
          const now = performance.now();
          return {
            notices: state.notices.map((notice) =>
              ids === undefined || ids.includes(notice.id)
                ? { ...notice, shownAt: now }
                : notice,
            ),
          };
        }),
      showPopup: (popup, open) =>
        set((state) => ({ popups: withPopup(state.popups, popup, open) })),
      togglePopup: (popup) =>
        set((state) => ({
          popups: withPopup(state.popups, popup, !state.popups.includes(popup)),
        })),
      showMenu: (menu) =>
        set((state) => ({ menu: nextMenu(state.menu, state.active, menu) })),
      closeMenu: () => set({ menu: undefined }),
      openPathMenu: (ask) => {
        const shown = pathMenus.open(ask);
        if (shown !== undefined) {
          set({ pathMenu: shown });
        }
      },
      closePathMenu: () => set({ pathMenu: undefined }),
      followPath: (path) =>
        post({ type: 'pathCommand', path, command: 'follow' }),
      closeTab: (id) => {
        const tab = get().tabs?.find((each) => each.id === id);
        if (tab?.unsaved === true) {
          set((state) => ({
            confirming: { kind: 'unsavedTab', tab },
            popups: withPopup(state.popups, 'confirm', true),
          }));
        } else if (tab !== undefined && confirmsClose[tab.tool]) {
          set((state) => ({
            confirming: { kind: 'tab', tab },
            popups: withPopup(state.popups, 'confirm', true),
          }));
        } else {
          post({ type: 'closeTab', tab: id });
        }
      },
      confirm: () => {
        const { confirming } = get();
        if (confirming === undefined) {
          return;
        }
        set((state) => ({
          confirming: undefined,
          popups: withPopup(state.popups, 'confirm', false),
        }));
        post(closingOf(confirming, true));
      },
      dontSave: () => {
        const { confirming } = get();
        if (confirming === undefined) {
          return;
        }
        set((state) => ({
          confirming: undefined,
          popups: withPopup(state.popups, 'confirm', false),
        }));
        post(closingOf(confirming, false));
      },
      cancel: () =>
        set((state) => ({
          confirming: undefined,
          popups: withPopup(state.popups, 'confirm', false),
        })),
      openWith: (tool) => {
        set((state) => ({
          choosing: undefined,
          popups: withPopup(state.popups, 'openWith', false),
        }));
        post({ type: 'openWith', tool });
      },
      moveTab: (id, index) => {
        set((state) => ({
          tabs: state.tabs && movedTab(state.tabs, id, index),
        }));
        post({ type: 'moveTab', tab: id, index });
      },
      tearTab: (id, grab, at) =>
        post({
          type: 'tearTab',
          tab: id,
          grabX: grab.x,
          grabY: grab.y,
          screenX: at.x,
          screenY: at.y,
        }),
      dragTabTo: (at) =>
        post({ type: 'dragTabTo', screenX: at.x, screenY: at.y }),
      dropTab: () => post({ type: 'dropTab' }),
      cancelTabDrag: () => post({ type: 'cancelTabDrag' }),
      reportStrip: (strip) => post({ type: 'tabStrip', ...strip }),
      visitIndex: (index) => post({ type: 'visitIndex', index }),
      moveTabToWindow: (id, window) =>
        post({
          type: 'moveTabToWindow',
          tab: id,
          ...(window !== undefined && { window }),
        }),
      setToolItems: (tool, items) =>
        set((state) => ({ toolItems: { ...state.toolItems, [tool]: items } })),
      setToolTitle: (tool, title) =>
        set((state) => ({
          toolTitles: { ...state.toolTitles, [tool]: title },
        })),
      changeTextView: (change) => {
        const view = { ...get().textView, ...change };
        set({ textView: view });
        post({ type: 'setTextView', view });
      },
      toggleTextView: (key) => {
        const view = { ...get().textView, [key]: !get().textView[key] };
        set({ textView: view });
        post({ type: 'setTextView', view });
      },
      changeImageView: (change) => {
        const view = { ...get().imageView, ...change };
        set({ imageView: view });
        post({ type: 'setImageView', view });
      },
      copyText: (text) => post({ type: 'copyText', text }),
      askLooks,
      ready: () => post({ type: 'ready' }),
      log: (message) => post({ type: 'log', level: 'info', message }),
      selectTab: (id) => post({ type: 'selectTab', tab: id }),
      preloadTab: (id) => post({ type: 'preloadTab', tab: id }),
      newTab: (tool) => post({ type: 'newTab', tool }),
      newWindow: () => post({ type: 'newWindow' }),
      openSettings: () => post({ type: 'openSettings' }),
      openDefaultSettings: () => post({ type: 'openDefaultSettings' }),
      checkForUpdates: () => post({ type: 'checkForUpdates' }),
      installUpdate: () => post({ type: 'installUpdate' }),
      installTerminalCommand: () => post({ type: 'installTerminalCommand' }),
      openIn: () => post({ type: 'openIn' }),
    };
  });
}

export const ShellStore = createContext<StoreApi<ShellState> | undefined>(
  undefined,
);

function useShellStore(): StoreApi<ShellState> {
  const store = useContext(ShellStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('shell'));
  }
  return store;
}

export function useShell<T>(select: (state: ShellState) => T): T {
  return useStore(useShellStore(), select);
}

export function useShellActions(): ShellActions {
  return useShellStore().getState();
}
