import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../shared/strings';
import type { ContextMenuItem, OpenMenu } from '../../ui/contextMenu';
import { defaultDateFormat } from '../../ui/dates';
import { defaultImageView } from '../../ui/imageView';
import { defaultScrolling, type ScrollSettings } from '../../ui/rowScroll';
import { defaultTextView } from '../../ui/textView';
import { addNotice } from '../shared/notices';
import type {
  AboutInfo,
  ImageView,
  TabInfo,
  TextView,
  ToHost,
  ToWebview,
  ToWebviewOf,
  StripPlace,
  TabVisit,
  UpdateStatus,
  WindowInfo,
} from '../shared/protocol';
import {
  confirmsClose,
  type ToHostOf,
  type ToolId,
  type ToWebviewOfTool,
} from '../shared/tools';
import type { Notice } from './notices';
import { movedTab } from './tabBar';

export type Popup = 'shortcuts' | 'about' | 'openWith' | 'confirm';

interface ToolChannel<K extends ToolId> {
  readonly post: (message: ToHostOf<K>) => void;
  readonly dropFiles: (files: readonly File[], message: unknown) => void;
  readonly listen: (
    handler: (message: ToWebviewOfTool<K>) => void,
  ) => () => void;
}

type ToolChannels = { readonly [K in ToolId]: ToolChannel<K> };

type ToolListeners = {
  readonly [K in ToolId]: Set<(message: ToWebviewOfTool<K>) => void>;
};

function listening<M>(
  listeners: Set<(message: M) => void>,
  handler: (message: M) => void,
): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

function deliver<K extends ToolId>(
  listeners: ToolListeners,
  tool: K,
  message: ToWebviewOfTool<K>,
): void {
  for (const listener of listeners[tool]) {
    listener(message);
  }
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type Confirming =
  | { readonly kind: 'tab'; readonly tab: TabInfo }
  | { readonly kind: 'window' }
  | { readonly kind: 'quit'; readonly note?: string };

export interface TabMenu {
  readonly tab: string | undefined;
  readonly menu: OpenMenu;
  readonly id: number;
}

export function nextMenu(
  previous: TabMenu | undefined,
  tab: string | undefined,
  menu: OpenMenu,
): TabMenu {
  return { tab, menu, id: (previous?.id ?? 0) + 1 };
}

export function menuIn(
  opened: TabMenu | undefined,
  tab: string | undefined,
): OpenMenu | undefined {
  return opened !== undefined && opened.tab === tab ? opened.menu : undefined;
}

export function withPopup(
  shown: readonly Popup[],
  popup: Popup,
  open: boolean,
): readonly Popup[] {
  if (shown.includes(popup) === open) {
    return shown;
  }
  return open ? [...shown, popup] : shown.filter((other) => other !== popup);
}

interface ShellSource {
  readonly tabs: readonly TabInfo[] | undefined;
  readonly active: string | undefined;
  readonly windows: readonly WindowInfo[];
  readonly tearsOff: boolean;
  readonly visit: TabVisit | undefined;
  readonly notices: readonly Notice[];
  readonly update: UpdateStatus;
  readonly about: AboutInfo | undefined;
  readonly installsCommand: boolean;
  readonly dateFormat: string;
  readonly scrolling: ScrollSettings;
  readonly textView: TextView;
  readonly imageView: ImageView;
  readonly choosing: ToWebviewOf<'chooseTool'> | undefined;
  readonly popups: readonly Popup[];
  readonly confirming: Confirming | undefined;
  readonly menu: TabMenu | undefined;
  readonly toolItems: Partial<Record<ToolId, readonly ContextMenuItem[]>>;
  readonly toolTitles: Partial<Record<ToolId, string>>;
}

interface ShellActions {
  readonly receive: (message: ToWebview) => void;
  readonly channels: ToolChannels;
  readonly dismissNotice: (id: number) => void;
  readonly restartNotices: (ids?: readonly number[]) => void;
  readonly showPopup: (popup: Popup, open: boolean) => void;
  readonly togglePopup: (popup: Popup) => void;
  readonly showMenu: (menu: OpenMenu) => void;
  readonly closeMenu: () => void;
  readonly closeTab: (id: string) => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
  readonly openWith: (tool: ToolId | undefined) => void;
  readonly moveTab: (id: string, index: number) => void;
  readonly moveTabToWindow: (id: string, window?: string) => void;
  readonly tearTab: (id: string, grab: ScreenPoint, at: ScreenPoint) => void;
  readonly dragTabTo: (at: ScreenPoint) => void;
  readonly dropTab: () => void;
  readonly cancelTabDrag: () => void;
  readonly reportStrip: (strip: StripPlace) => void;
  readonly visitIndex: (index: number) => void;
  readonly setToolItems: (
    tool: ToolId,
    items: readonly ContextMenuItem[],
  ) => void;
  readonly setToolTitle: (tool: ToolId, title: string | undefined) => void;
  readonly changeTextView: (change: Partial<TextView>) => void;
  readonly toggleTextView: (key: 'wordWrap' | 'showWhitespace') => void;
  readonly changeImageView: (change: Partial<ImageView>) => void;
  readonly copyText: (text: string) => void;
  readonly ready: () => void;
  readonly log: (message: string) => void;
  readonly selectTab: (id: string) => void;
  readonly preloadTab: (id: string) => void;
  readonly newTab: (tool: ToolId) => void;
  readonly newWindow: () => void;
  readonly openSettings: () => void;
  readonly openDefaultSettings: () => void;
  readonly checkForUpdates: () => void;
  readonly installUpdate: () => void;
  readonly installTerminalCommand: () => void;
  readonly openIn: () => void;
}

type ShellState = ShellSource & ShellActions;

const shellDefaults: ShellSource = {
  tabs: undefined,
  active: undefined,
  windows: [],
  tearsOff: false,
  visit: undefined,
  notices: [],
  update: { kind: 'idle' },
  about: undefined,
  installsCommand: false,
  dateFormat: defaultDateFormat,
  scrolling: defaultScrolling,
  textView: defaultTextView,
  imageView: defaultImageView,
  choosing: undefined,
  popups: [],
  confirming: undefined,
  menu: undefined,
  toolItems: {},
  toolTitles: {},
};

function received(
  state: ShellSource,
  message: ToWebview,
  noticeId: () => number,
): Partial<ShellSource> {
  switch (message.type) {
    case 'windows':
      return { windows: message.windows };
    case 'tearsOff':
      return { tearsOff: message.allowed };
    case 'tabVisit':
      return { visit: message.visit };
    case 'tabs':
      return {
        tabs: message.tabs,
        active: message.active,
        menu:
          menuIn(state.menu, message.active) === undefined
            ? undefined
            : state.menu,
      };
    case 'dateFormat':
      return { dateFormat: message.format };
    case 'scrolling':
      return {
        scrolling: { wheelRows: message.wheelRows, smooth: message.smooth },
      };
    case 'textView':
      return { textView: message.view };
    case 'imageView':
      return { imageView: message.view };
    case 'notice':
      return {
        notices: addNotice(state.notices, {
          id: noticeId(),
          level: message.level,
          message: message.message,
          shownAt: performance.now(),
        }),
      };
    case 'update':
      return { update: message.status };
    case 'about':
      return { about: message };
    case 'terminalCommand':
      return { installsCommand: message.installable };
    case 'confirmCloseWindow':
      return {
        confirming: { kind: 'window' },
        popups: withPopup(state.popups, 'confirm', true),
      };
    case 'confirmQuit':
      return {
        confirming: {
          kind: 'quit',
          ...(message.note !== undefined && { note: message.note }),
        },
        popups: withPopup(state.popups, 'confirm', true),
      };
    case 'chooseTool':
      return {
        choosing: message,
        popups: withPopup(state.popups, 'openWith', true),
      };
    default:
      return {};
  }
}

export function activeTabOf({
  tabs,
  active,
}: ShellSource): TabInfo | undefined {
  return tabs?.find((tab) => tab.id === active);
}

export function comparingOf(state: ShellSource): string | undefined {
  const tab = activeTabOf(state);
  return tab?.compare === true ? tab.id : undefined;
}

export function createShellStore(
  post: (message: ToHost) => void,
  initial: Partial<ShellSource> = {},
  dropFiles: (
    files: readonly File[],
    tool: ToolId,
    message: unknown,
  ) => void = () => {},
): StoreApi<ShellState> {
  let noticesShown = 0;
  const listeners: ToolListeners = {
    terminal: new Set(),
    commander: new Set(),
    git: new Set(),
  };
  const channels: ToolChannels = {
    terminal: {
      post: (message) => post({ type: 'tool', tool: 'terminal', message }),
      dropFiles: (files, message) => dropFiles(files, 'terminal', message),
      listen: (handler) => listening(listeners.terminal, handler),
    },
    commander: {
      post: (message) => post({ type: 'tool', tool: 'commander', message }),
      dropFiles: (files, message) => dropFiles(files, 'commander', message),
      listen: (handler) => listening(listeners.commander, handler),
    },
    git: {
      post: (message) => post({ type: 'tool', tool: 'git', message }),
      dropFiles: (files, message) => dropFiles(files, 'git', message),
      listen: (handler) => listening(listeners.git, handler),
    },
  };
  return createStore<ShellState>()((set, get) => {
    return {
      ...shellDefaults,
      ...initial,
      receive: (message) => {
        if (message.type === 'tool') {
          deliver(listeners, message.tool, message.message);
        } else {
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
      closeTab: (id) => {
        const tab = get().tabs?.find((each) => each.id === id);
        if (tab !== undefined && confirmsClose[tab.tool]) {
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
        post(
          confirming.kind === 'tab'
            ? { type: 'closeTab', tab: confirming.tab.id }
            : confirming.kind === 'window'
              ? { type: 'closeWindow' }
              : { type: 'quit' },
        );
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
