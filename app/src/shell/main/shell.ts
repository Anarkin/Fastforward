import * as path from 'node:path';
import type { Log } from './log';
import { isImageView, isTextView } from '../shared/views';
import type {
  CommandInstall,
  CommandState,
  DragStart,
  Point,
  Strip,
  Visit,
} from './hostTypes';
import { InFlight } from '../../lib/main/inFlight';
import { addNotice } from '../shared/notices';
import type {
  AboutInfo,
  TabInfo,
  ToHost,
  ToWebview,
  ToWebviewOf,
  UpdateStatus,
} from '../shared/protocol';
import { strings, type Sentence } from '../../lib/shared/strings';
import {
  confirmsClose,
  isTool,
  tools as toolIds,
  type ToHostOf,
  type ToolId,
} from '../shared/tools';
import {
  type Compared,
  sameRoot,
  type SavedTab,
  type Storage,
} from './storage';
import { TabHistory } from './tabHistory';
import {
  activeTabOf,
  nextTabId,
  nextWindowId,
  windowOf,
  withActive,
  withChanged,
  withClosed,
  withMoved,
  withOpened,
  type Emptied,
  type TabWindow,
} from './windows';
import { ToolChoosing } from './toolChoosing';

export interface Page {
  post(message: ToWebview): void;
  readonly disposed: boolean;
}

export type Tab = SavedTab;

export interface TabName {
  readonly name: string;
  readonly folder?: string;
  readonly icon?: string;
  readonly unsaved?: true;
}

export type Notice = Omit<ToWebviewOf<'notice'>, 'type'>;

export interface ShownTab {
  readonly page: Page | undefined;
  readonly tab: Tab;
}

export interface ShellAccess {
  page(): Page | undefined;
  pages(): readonly Page[];
  current(page: Page): Page | undefined;
  tabs(): readonly Tab[];
  active(page: Page): Tab | undefined;
  shown(): readonly ShownTab[];
  open(
    page: Page,
    tool: ToolId,
    roots: readonly (string | undefined)[],
    reuse: boolean,
  ): Promise<void>;
  openView(page: Page, tool: ToolId, file: string): Promise<void>;
  openEdit(page: Page, tool: ToolId, file: string): Promise<void>;
  editViewed(page: Page, tab: string): Promise<void>;
  openCompare(page: Page, tool: ToolId, compare: Compared): Promise<void>;
  openFolders(
    page: Page,
    tool: ToolId,
    folders: readonly string[],
  ): Promise<void>;
  setRoot(tab: string, root: string): void;
  visited(folder: string): void;
  recentFolders(): number;
  postTabs(page: Page): void;
  notice(page: Page | undefined, notice: Notice): void;
  track<T>(work: Promise<T>): Promise<T>;
  idle(): Promise<void>;
}

export interface Tool<K extends ToolId> {
  attach(shell: ShellAccess): void;
  ready(page: Page): void;
  show(page: Page, tab: Tab): Promise<void>;
  shows(page: Page, tab: Tab): boolean;
  hide(page: Page): void;
  preload(page: Page, tab: Tab): Promise<void>;
  closed(page: Page, tab: Tab): void;
  receive(page: Page, message: ToHostOf<K>): Promise<void>;
  dropped?(page: Page, files: unknown, message: unknown): Promise<void>;
  refreshShown(page: Page): Promise<void>;
  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName>;
  fits(folder: string): Promise<boolean>;
  folderOf(tab: Tab): string | undefined;
  visited(folder: string): void;
  open(page: Page, folders: readonly string[]): Promise<void>;
  newTab(page: Page): Promise<void>;
  reloadSettings(): void;
  quitNote?(): string | undefined;
  unsaved?(tab: Tab): boolean;
  saveUnsaved?(page: Page, tab: Tab): Promise<boolean>;
  quit(): void;
}

export type Tools = { readonly [K in ToolId]: Tool<K> };

export function quitNoteOf(
  tools: Readonly<Record<ToolId, Pick<Tool<ToolId>, 'quitNote'>>>,
): string | undefined {
  const notes = toolIds.flatMap((tool) => tools[tool].quitNote?.() ?? []);
  return notes.length === 0 ? undefined : notes.join(' ');
}

export interface ShellHost {
  userSettingsFile(): Promise<string>;
  defaultSettingsFile(): Promise<string>;
  settingsProblems(): readonly Sentence[];
  stateProblems(): readonly Sentence[];
  checkForUpdates(): void;
  installUpdate(): void;
  quit(): void;
  updateStatus(): UpdateStatus;
  about(): AboutInfo;
  copyText(text: string): void;
  canInstallCommand(): boolean;
  commandState(): Promise<CommandState>;
  installCommand(): Promise<CommandInstall>;
  openWindow(window: string, near: string | undefined): void;
  closeWindow(window: string): void;
  showWindow(window: string): void;
  tearsOff(): boolean;
  drag(window: string, event: DragEvent): void;
}

export type DragEvent =
  | ({ readonly kind: 'start' } & DragStart)
  | { readonly kind: 'move'; readonly at: Point }
  | { readonly kind: 'drop' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'strip'; readonly strip: Strip }
  | { readonly kind: 'index'; readonly index: number };

function stripOf(message: Record<string, unknown>): Strip | undefined {
  const { left, right, top, bottom, firstTabLeft, tabTop } = message;
  return typeof left === 'number' &&
    typeof right === 'number' &&
    typeof top === 'number' &&
    typeof bottom === 'number' &&
    typeof firstTabLeft === 'number' &&
    typeof tabTop === 'number' &&
    [left, right, top, bottom, firstTabLeft, tabTop].every(Number.isFinite)
    ? { left, right, top, bottom, firstTabLeft, tabTop }
    : undefined;
}

function pointOf(x: unknown, y: unknown): Point | undefined {
  return typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y)
    ? { x, y }
    : undefined;
}

export interface Connection {
  receive(message: ToHost): Promise<void>;
  dropped(files: unknown, tool: unknown, message: unknown): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

export const unattachedShell: ShellAccess = {
  page: () => undefined,
  pages: () => [],
  current: () => undefined,
  tabs: () => [],
  active: () => undefined,
  shown: () => [],
  open: () => Promise.resolve(),
  openView: () => Promise.resolve(),
  openEdit: () => Promise.resolve(),
  editViewed: () => Promise.resolve(),
  openCompare: () => Promise.resolve(),
  openFolders: () => Promise.resolve(),
  setRoot: () => undefined,
  visited: () => undefined,
  recentFolders: () => 0,
  postTabs: () => undefined,
  notice: () => undefined,
  track: (work) => work,
  idle: () => Promise.resolve(),
};

const closedPage: Page = { post: () => undefined, disposed: true };

function receiveIn<K extends ToolId>(
  all: Tools,
  tool: K,
  page: Page,
  message: ToHostOf<K>,
): Promise<void> {
  return all[tool].receive(page, message);
}

function commandNotice(installed: CommandInstall): Notice | undefined {
  switch (installed.kind) {
    case 'installed':
      return {
        level: 'info',
        message: installed.onPath
          ? strings.messages.commandInstalled(installed.path)
          : strings.messages.commandOffPath(
              installed.path,
              path.posix.dirname(installed.path),
            ),
      };
    case 'alreadyInstalled':
      return {
        level: 'info',
        message: strings.messages.commandAlreadyInstalled(installed.path),
      };
    case 'taken':
      return {
        level: 'error',
        message: strings.messages.commandTaken(installed.path),
      };
    case 'notMoved':
      return { level: 'error', message: strings.messages.commandNotMoved };
    case 'cancelled':
      return undefined;
    default:
      return installed satisfies never;
  }
}

function isMessage(message: unknown): message is ToHost {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string'
  );
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Shell {
  private readonly pages = new Map<string, Page>();
  private readonly windowsOfPages = new WeakMap<Page, string>();
  private readonly shownTools = new WeakMap<Page, ToolId>();
  private readonly windowsSent = new WeakMap<Page, string>();
  private focusedWindow: string | undefined;
  private lastPageLog: string | undefined;
  private unsentNotices: readonly ToWebviewOf<'notice'>[] = [];
  private readonly inFlight = new InFlight();
  private readonly history = new TabHistory();
  private readonly choosing: ToolChoosing;

  constructor(
    private readonly log: Log,
    private readonly storage: Storage,
    private readonly host: ShellHost,
    private readonly tools: Tools,
  ) {
    this.choosing = new ToolChoosing(tools, {
      activeTab: (page) => this.activeTab(page),
      notice: (page, notice) => this.notice(page, notice),
    });
    const access: ShellAccess = {
      page: () => this.focused(),
      pages: () => [...this.pages.values()].filter((page) => !page.disposed),
      current: (page) =>
        page.disposed ? this.livePage(this.windowsOfPages.get(page)) : page,
      tabs: () => this.storage.savedTabs,
      active: (page) => this.activeTab(page),
      shown: () =>
        this.storage.layout.flatMap((window) => {
          const tab = activeTabOf(window);
          return tab === undefined
            ? []
            : [{ page: this.pages.get(window.id), tab }];
        }),
      open: (page, tool, roots, reuse) => this.open(page, tool, roots, reuse),
      openView: (page, tool, file) =>
        this.open(page, tool, [file], false, { view: true }),
      openEdit: (page, tool, file) =>
        this.open(page, tool, [file], true, { edit: true }),
      editViewed: (page, tab) => this.editViewed(page, tab),
      openCompare: (page, tool, compare) =>
        this.open(page, tool, [undefined], false, { compare }),
      openFolders: (page, tool, folders) =>
        this.tools[tool].open(page, folders),
      setRoot: (tab, root) => this.setRoot(tab, root),
      visited: (folder) => {
        for (const tool of toolIds) {
          this.tools[tool].visited(folder);
        }
      },
      recentFolders: () => this.storage.recentFolders,
      postTabs: (page) => this.postTabs(page),
      notice: (page, notice) => this.notice(page, notice),
      track: (work) => this.inFlight.track(work),
      idle: () => this.idle(),
    };
    for (const tool of toolIds) {
      this.tools[tool].attach(access);
    }
  }

  windows(): readonly string[] {
    return this.storage.layout.map((window) => window.id);
  }

  connect(window: string, post: (message: ToWebview) => void): Connection {
    const page = {
      post: (message: ToWebview) => {
        if (!page.disposed) {
          post(message);
        }
      },
      disposed: false,
    };
    this.windowsOfPages.set(page, window);
    return {
      receive: (message) =>
        isMessage(message)
          ? this.inFlight.track(
              this.handle(message, page).catch((error: unknown) => {
                this.log.error(strings.log.handlingFailed(message.type));
                this.log.error(error);
                this.notice(page, { level: 'error', message: reasonOf(error) });
              }),
            )
          : Promise.resolve(),
      dropped: (files, tool, message) => {
        const receiving = isTool(tool) ? this.tools[tool] : undefined;
        if (receiving?.dropped === undefined) {
          return Promise.resolve();
        }
        return this.inFlight.track(
          receiving.dropped(page, files, message).catch((error: unknown) => {
            this.log.error(error);
            this.notice(page, { level: 'error', message: reasonOf(error) });
          }),
        );
      },
      refresh: () => {
        const tab = this.activeTab(page);
        return tab === undefined
          ? Promise.resolve()
          : this.inFlight.track(this.tools[tab.tool].refreshShown(page));
      },
      dispose: () => {
        page.disposed = true;
        for (const tool of toolIds) {
          this.tools[tool].hide(page);
        }
        this.host.drag(window, { kind: 'drop' });
        if (this.pages.get(window) === page && !this.laidOut(window)) {
          this.pages.delete(window);
        }
      },
    };
  }

  openFolders(folders: readonly string[]): Promise<void> {
    this.log.info(strings.log.openingAsked(folders.join(', ')));
    this.choosing.asked(folders);
    const page = this.focused();
    if (page === undefined || page.disposed) {
      return Promise.resolve();
    }
    return this.inFlight.track(
      this.choosing.askFolders(page).catch((error: unknown) => {
        this.log.error(strings.log.openingAskedFailed);
        this.log.error(error);
      }),
    );
  }

  reloadSettings(): void {
    for (const tool of toolIds) {
      this.tools[tool].reloadSettings();
    }
  }

  quit(): void {
    for (const tool of toolIds) {
      this.tools[tool].quit();
    }
  }

  idle(): Promise<void> {
    return this.inFlight.settled();
  }

  asksBeforeQuit(): boolean {
    return (
      [...this.pages.values()].some((page) => !page.disposed) &&
      (this.storage.savedTabs.some((tab) => confirmsClose[tab.tool]) ||
        this.unsavedOf(this.storage.savedTabs).length > 0 ||
        quitNoteOf(this.tools) !== undefined)
    );
  }

  askToQuit(): void {
    const note = quitNoteOf(this.tools);
    const unsaved = this.namesOf(this.unsavedOf(this.storage.savedTabs));
    this.shownPage()?.post({
      type: 'confirmQuit',
      ...(note !== undefined && { note }),
      ...(unsaved.length > 0 && { unsaved }),
    });
  }

  private unsavedOf(tabs: readonly Tab[]): Tab[] {
    return tabs.filter((tab) => this.tools[tab.tool].unsaved?.(tab) === true);
  }

  private namesOf(tabs: readonly Tab[]): string[] {
    return this.infos(tabs).map((info) => info.name);
  }

  private tabsOfWindow(window: string): readonly Tab[] {
    return this.storage.layout.find((each) => each.id === window)?.tabs ?? [];
  }

  private async savedAll(page: Page, tabs: readonly Tab[]): Promise<boolean> {
    for (const tab of this.unsavedOf(tabs)) {
      const holder = windowOf(this.storage.layout, tab.id);
      const shownIn =
        (holder === undefined ? undefined : this.livePage(holder.id)) ?? page;
      if ((await this.tools[tab.tool].saveUnsaved?.(shownIn, tab)) !== true) {
        return false;
      }
    }
    return true;
  }

  notify(notice: Notice): void {
    this.notice(undefined, notice);
  }

  focus(window: string): void {
    this.focusedWindow = window;
  }

  asksBeforeClosing(window: string): boolean {
    const tabs = this.tabsOfWindow(window);
    return (
      tabs.some((tab) => confirmsClose[tab.tool]) ||
      this.unsavedOf(tabs).length > 0
    );
  }

  askToCloseWindow(window: string): boolean {
    const page = this.livePage(window);
    const unsaved = this.namesOf(this.unsavedOf(this.tabsOfWindow(window)));
    page?.post({
      type: 'confirmCloseWindow',
      ...(unsaved.length > 0 && { unsaved }),
    });
    return page !== undefined;
  }

  closeWindow(window: string): void {
    const { storage } = this;
    const closing = storage.layout.find((each) => each.id === window);
    if (closing === undefined || storage.layout.length < 2) {
      return;
    }
    this.save(
      storage.setLayout(storage.layout.filter((each) => each !== closing)),
    );
    const page = this.pages.get(window) ?? closedPage;
    for (const tab of closing.tabs) {
      this.history.forget(tab.id);
      this.tools[tab.tool].closed(page, tab);
    }
    this.postWindows();
  }

  private shownPage(): Page | undefined {
    return (
      this.livePage(this.focusedWindow) ??
      this.storage.layout
        .map((window) => this.livePage(window.id))
        .find((page) => page !== undefined)
    );
  }

  private focused(): Page | undefined {
    return this.focusedWindow === undefined
      ? undefined
      : this.pages.get(this.focusedWindow);
  }

  private windowOf(page: Page): TabWindow {
    const { layout } = this.storage;
    const id = this.windowsOfPages.get(page) ?? layout[0]?.id ?? '1';
    return layout.find((window) => window.id === id) ?? { id, tabs: [] };
  }

  private postToAll(message: ToWebview): void {
    for (const page of this.pages.values()) {
      page.post(message);
    }
  }

  private livePage(window: string | undefined): Page | undefined {
    const page = window === undefined ? undefined : this.pages.get(window);
    return page === undefined || page.disposed ? undefined : page;
  }

  private activeTab(page: Page): Tab | undefined {
    return activeTabOf(this.windowOf(page));
  }

  private async handle(message: ToHost, page: Page): Promise<void> {
    const { storage, host } = this;
    switch (message.type) {
      case 'ready':
        await this.ready(page);
        return;
      case 'openSettings':
        await this.open(
          page,
          'commander',
          [await host.userSettingsFile()],
          true,
          {
            edit: true,
          },
        );
        return;
      case 'openDefaultSettings':
        await this.open(
          page,
          'commander',
          [await host.defaultSettingsFile()],
          true,
          { edit: true },
        );
        return;
      case 'installTerminalCommand':
        await this.installCommand(page);
        return;
      case 'checkForUpdates':
        host.checkForUpdates();
        return;
      case 'installUpdate':
        host.installUpdate();
        return;
      case 'quit':
        if (
          message.save === true &&
          !(await this.savedAll(page, this.storage.savedTabs))
        ) {
          return;
        }
        host.quit();
        return;
      case 'newWindow': {
        const window = nextWindowId(storage.layout);
        this.save(
          storage.setLayout([...storage.layout, { id: window, tabs: [] }]),
        );
        host.openWindow(window, this.windowOf(page).id);
        this.postWindows();
        return;
      }
      case 'closeWindow': {
        const window = this.windowOf(page);
        if (
          message.save === true &&
          !(await this.savedAll(page, window.tabs))
        ) {
          return;
        }
        host.closeWindow(window.id);
        return;
      }
      case 'moveTabToWindow':
        await this.moveToWindow(page, message.tab, message.window);
        return;
      case 'tearTab': {
        const window = this.windowOf(page);
        const index = window.tabs.findIndex((tab) => tab.id === message.tab);
        const grab = pointOf(message.grabX, message.grabY);
        const at = pointOf(message.screenX, message.screenY);
        if (index !== -1 && grab !== undefined && at !== undefined) {
          host.drag(window.id, {
            kind: 'start',
            tab: message.tab,
            index,
            grab,
            at,
            alone: window.tabs.length === 1,
          });
        }
        return;
      }
      case 'dragTabTo': {
        const at = pointOf(message.screenX, message.screenY);
        if (at !== undefined) {
          host.drag(this.windowOf(page).id, { kind: 'move', at });
        }
        return;
      }
      case 'dropTab':
        host.drag(this.windowOf(page).id, { kind: 'drop' });
        return;
      case 'cancelTabDrag':
        host.drag(this.windowOf(page).id, { kind: 'cancel' });
        return;
      case 'tabStrip': {
        const strip = stripOf({ ...message });
        if (strip !== undefined) {
          host.drag(this.windowOf(page).id, { kind: 'strip', strip });
        }
        return;
      }
      case 'visitIndex':
        if (Number.isSafeInteger(message.index) && message.index >= 0) {
          host.drag(this.windowOf(page).id, {
            kind: 'index',
            index: message.index,
          });
        }
        return;
      case 'copyText':
        if (typeof message.text === 'string') {
          host.copyText(message.text);
        }
        return;
      case 'log':
        if (
          (message.level === 'info' || message.level === 'error') &&
          typeof message.message === 'string' &&
          message.message !== this.lastPageLog
        ) {
          this.lastPageLog = message.message;
          this.log[message.level](strings.log.webview(message.message));
        }
        return;
      case 'selectTab': {
        const window = this.windowOf(page);
        const tab = window.tabs.find((each) => each.id === message.tab);
        if (
          tab === undefined ||
          (tab.id === window.active &&
            this.pages.get(window.id) === page &&
            this.tools[tab.tool].shows(page, tab))
        ) {
          return;
        }
        await this.show(page, tab.id);
        return;
      }
      case 'closeTab': {
        const closing = storage.savedTabs.filter(
          (tab) => tab.id === message.tab,
        );
        if (message.save === true && !(await this.savedAll(page, closing))) {
          return;
        }
        await this.close(page, message.tab);
        return;
      }
      case 'preloadTab': {
        const window = this.windowOf(page);
        const tab = window.tabs.find((each) => each.id === message.tab);
        if (tab !== undefined && tab.id !== window.active) {
          await this.tools[tab.tool].preload(page, tab);
        }
        return;
      }
      case 'moveTab': {
        const window = this.windowOf(page);
        if (
          window.tabs.some((tab) => tab.id === message.tab) &&
          Number.isInteger(message.index) &&
          message.index >= 0 &&
          message.index < window.tabs.length
        ) {
          this.save(
            storage.setLayout(
              withMoved(
                storage.layout,
                message.tab,
                window.id,
                message.index,
                this.history,
              ),
            ),
          );
        }
        this.postTabs(page);
        return;
      }
      case 'setTextView':
        if (!isTextView(message.view)) {
          return;
        }
        this.save(storage.setTextView(message.view));
        this.postToAll({ type: 'textView', view: storage.textView });
        return;
      case 'setImageView':
        if (!isImageView(message.view)) {
          return;
        }
        this.save(storage.setImageView(message.view));
        this.postToAll({ type: 'imageView', view: storage.imageView });
        return;
      case 'newTab':
        if (isTool(message.tool)) {
          await this.tools[message.tool].newTab(page);
        }
        return;
      case 'openWith':
        await this.choosing.openWith(page, message.tool);
        return;
      case 'openIn':
        await this.choosing.openIn(page);
        return;
      case 'tool':
        if (isTool(message.tool)) {
          await receiveIn(this.tools, message.tool, page, message.message);
        }
        return;
      default:
        return message satisfies never;
    }
  }

  private async ready(page: Page): Promise<void> {
    const { storage, host } = this;
    page.post({ type: 'dateFormat', format: storage.dateFormat });
    page.post({
      type: 'scrolling',
      wheelRows: storage.wheelRows,
      smooth: storage.smoothScrolling,
    });
    page.post({ type: 'textView', view: storage.textView });
    page.post({ type: 'imageView', view: storage.imageView });
    page.post({ type: 'update', status: host.updateStatus() });
    page.post({ type: 'about', ...host.about() });
    page.post({ type: 'tearsOff', allowed: host.tearsOff() });
    page.post({
      type: 'terminalCommand',
      installable: host.canInstallCommand(),
    });
    const window = this.windowOf(page);
    const laidOut = this.laidOut(window.id);
    if (laidOut) {
      this.tellProblems(page);
    }
    for (const tool of toolIds) {
      this.tools[tool].ready(page);
    }
    this.pages.set(window.id, page);
    if (laidOut) {
      this.focusedWindow = window.id;
    }
    this.shownTools.delete(page);
    await this.show(page, window.active);
    if (laidOut) {
      await this.choosing.askFolders(page);
    }
  }

  private laidOut(window: string): boolean {
    return this.storage.layout.some((each) => each.id === window);
  }

  private tellProblems(page: Page): void {
    const { storage, host } = this;
    if (host.canInstallCommand() && !storage.commandOffered) {
      void this.inFlight.track(this.offerCommand(page));
    }
    for (const problem of host.settingsProblems()) {
      page.post({
        type: 'notice',
        level: 'error',
        message: strings.messages.settingsProblem(problem),
      });
    }
    for (const problem of host.stateProblems()) {
      page.post({ type: 'notice', level: 'error', message: problem });
    }
  }

  private async show(page: Page, id: string | undefined): Promise<void> {
    const { storage } = this;
    const window = this.windowOf(page);
    const active =
      window.tabs.find((tab) => tab.id === id) ?? window.tabs.at(0);
    this.save(
      storage.setLayout(withActive(storage.layout, window.id, active?.id)),
    );
    if (active !== undefined) {
      this.history.visit(active.id);
    }
    if (page.disposed) {
      return;
    }
    this.pages.set(window.id, page);
    const laidOut = this.laidOut(window.id);
    if (laidOut) {
      this.focusedWindow = window.id;
    }
    this.postTabs(page);
    if (laidOut) {
      const unsent = this.unsentNotices;
      this.unsentNotices = [];
      for (const notice of unsent) {
        page.post(notice);
      }
    }
    const shown = this.shownTools.get(page);
    if (active === undefined) {
      this.shownTools.delete(page);
    } else {
      this.shownTools.set(page, active.tool);
    }
    if (shown !== undefined && shown !== active?.tool) {
      this.tools[shown].hide(page);
    }
    if (active !== undefined) {
      await this.tools[active.tool].show(page, active);
    }
  }

  private async close(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const window = this.windowOf(page);
    const closed = window.tabs.find((tab) => tab.id === id);
    if (closed === undefined) {
      this.postTabs(page);
      return;
    }
    const activeId = window.active;
    const layout = withClosed(storage.layout, id, this.history);
    const active = layout.find((each) => each.id === window.id)?.active;
    this.history.forget(id);
    this.save(storage.setLayout(layout));
    this.tools[closed.tool].closed(page, closed);
    if (!layout.some((each) => each.id === window.id)) {
      this.host.closeWindow(window.id);
      this.postWindows();
      return;
    }
    if (active === activeId && active !== undefined) {
      this.postTabs(page);
      return;
    }
    await this.show(page, active);
  }

  private async open(
    page: Page,
    tool: ToolId,
    roots: readonly (string | undefined)[],
    reuse: boolean,
    kind: Pick<Tab, 'view' | 'edit' | 'compare'> = {},
  ): Promise<void> {
    const { storage } = this;
    const window = this.windowOf(page);
    const tabs = storage.savedTabs;
    const added: Tab[] = [];
    const opened: string[] = [];
    let next = Number(nextTabId(storage.layout));
    for (const root of roots) {
      const existing = reuse
        ? [...tabs, ...added].find(
            (tab) =>
              tab.tool === tool &&
              tab.view === kind.view &&
              tab.edit === kind.edit &&
              tab.root !== undefined &&
              root !== undefined &&
              sameRoot(tab.root, root),
          )
        : undefined;
      if (existing !== undefined) {
        opened.push(existing.id);
        continue;
      }
      const tab: Tab = {
        id: String(next++),
        tool,
        ...(root !== undefined && { root }),
        ...kind,
      };
      added.push(tab);
      opened.push(tab.id);
    }
    this.save(storage.setLayout(withOpened(storage.layout, window.id, added)));
    const live = page.disposed ? (this.pages.get(window.id) ?? page) : page;
    const last = opened.at(-1);
    if (last === undefined) {
      this.postTabs(live);
      return;
    }
    const holder = windowOf(storage.layout, last);
    if (holder === undefined || holder.id === window.id) {
      await this.show(live, last);
      return;
    }
    this.host.showWindow(holder.id);
    const there = this.livePage(holder.id);
    if (there === undefined) {
      this.save(storage.setLayout(withActive(storage.layout, holder.id, last)));
      this.postTabs(live);
      return;
    }
    await this.show(there, last);
  }

  private async editViewed(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const viewed = this.windowOf(page).tabs.find(
      (tab) => tab.id === id && tab.view === true,
    );
    if (viewed?.root === undefined) {
      return;
    }
    this.tools[viewed.tool].closed(page, viewed);
    this.save(
      storage.setLayout(
        withChanged(storage.layout, {
          id,
          tool: viewed.tool,
          root: viewed.root,
          edit: true,
        }),
      ),
    );
    await this.show(page, id);
  }

  private setRoot(id: string, root: string): void {
    const { storage } = this;
    const tab = storage.savedTabs.find(
      (each) => each.id === id && each.root !== root,
    );
    if (tab === undefined) {
      return;
    }
    this.save(storage.setLayout(withChanged(storage.layout, { ...tab, root })));
    const page = this.livePage(windowOf(storage.layout, id)?.id);
    if (page !== undefined) {
      this.postTabs(page);
    }
  }

  private postTabs(page: Page): void {
    page.post({
      type: 'tabs',
      tabs: this.infos(this.windowOf(page).tabs),
      active: this.activeTab(page)?.id,
    });
    this.postWindows();
  }

  private postWindows(): void {
    const { layout } = this.storage;
    const names = new Map(
      this.infos(this.storage.savedTabs).map((info) => [
        info.id,
        strings.tabs.label(info.name, info.folder),
      ]),
    );
    for (const [id, page] of this.pages) {
      const windows = layout
        .filter((window) => window.id !== id)
        .map((window) => {
          const shown = activeTabOf(window) ?? window.tabs.at(0);
          return {
            id: window.id,
            name:
              (shown === undefined ? undefined : names.get(shown.id)) ??
              strings.tabs.noTabWindow,
          };
        });
      const sent = JSON.stringify(windows);
      if (!page.disposed && this.windowsSent.get(page) !== sent) {
        this.windowsSent.set(page, sent);
        page.post({ type: 'windows', windows });
      }
    }
  }

  private async moveToWindow(
    page: Page,
    tab: unknown,
    target: unknown,
  ): Promise<void> {
    const { storage } = this;
    const from = this.windowOf(page);
    if (
      typeof tab !== 'string' ||
      !from.tabs.some((each) => each.id === tab) ||
      (target === undefined
        ? from.tabs.length < 2
        : typeof target !== 'string' ||
          target === from.id ||
          !storage.layout.some((window) => window.id === target))
    ) {
      this.postTabs(page);
      return;
    }
    if (typeof target === 'string') {
      this.host.showWindow(target);
      await this.relocate(
        tab,
        from.id,
        target,
        storage.layout.find((window) => window.id === target)?.tabs.length ?? 0,
        false,
      );
      return;
    }
    const into = nextWindowId(storage.layout);
    const moving = this.relocate(tab, from.id, into, 0, true);
    this.host.openWindow(into, from.id);
    await moving;
  }

  async tearOff(tab: string, into: string): Promise<boolean> {
    const { layout } = this.storage;
    const from = windowOf(layout, tab);
    if (
      from === undefined ||
      from.tabs.length < 2 ||
      layout.some((window) => window.id === into)
    ) {
      return false;
    }
    await this.relocate(tab, from.id, into, 0, true);
    return true;
  }

  async moveTab(tab: string, into: string, index: number): Promise<void> {
    const { storage } = this;
    const from = windowOf(storage.layout, tab);
    if (
      from === undefined ||
      !storage.layout.some((window) => window.id === into)
    ) {
      return;
    }
    if (from.id !== into) {
      await this.relocate(tab, from.id, into, index, false, 'kept');
      return;
    }
    this.save(
      storage.setLayout(
        withMoved(storage.layout, tab, into, index, this.history),
      ),
    );
    const page = this.livePage(into);
    if (page !== undefined) {
      this.postTabs(page);
    }
  }

  visit(window: string, visit: Visit | undefined): void {
    const page = this.livePage(window);
    const tab =
      visit === undefined
        ? undefined
        : this.storage.savedTabs.find((each) => each.id === visit.tab);
    const [info] = tab === undefined ? [] : this.infos([tab]);
    page?.post(
      visit === undefined || info === undefined
        ? { type: 'tabVisit' }
        : {
            type: 'tabVisit',
            visit: { tab: info, x: visit.x, grabX: visit.grabX },
          },
    );
  }

  private async relocate(
    tab: string,
    from: string,
    into: string,
    index: number,
    added: boolean,
    emptied: Emptied = 'closed',
  ): Promise<void> {
    const { storage } = this;
    const before = added
      ? [...storage.layout, { id: into, tabs: [] }]
      : storage.layout;
    const layout = withMoved(before, tab, into, index, this.history, emptied);
    this.save(storage.setLayout(layout));
    const there = this.livePage(into);
    const shown = there === undefined ? undefined : this.show(there, tab);
    const left = layout.find((window) => window.id === from);
    if (left === undefined) {
      this.host.closeWindow(from);
      this.postWindows();
      await shown;
      return;
    }
    const page = this.livePage(from);
    await Promise.all([
      shown,
      page === undefined ? undefined : this.show(page, left.active),
    ]);
  }

  private infos(tabs: readonly Tab[]): TabInfo[] {
    const names = new Map(
      toolIds.flatMap((tool) => [
        ...this.tools[tool].names(tabs.filter((tab) => tab.tool === tool)),
      ]),
    );
    return tabs.map(({ id, tool, root, view, edit, compare }) => {
      const name = names.get(id);
      return {
        id,
        tool,
        name: name?.name ?? strings.tools[tool],
        ...(name?.folder !== undefined && { folder: name.folder }),
        ...(name?.icon !== undefined && { icon: name.icon }),
        ...(root !== undefined && { root }),
        ...(view === true && { view }),
        ...(edit === true && { edit }),
        ...(compare !== undefined && { compare: true as const }),
        ...(name?.unsaved === true && { unsaved: true as const }),
      };
    });
  }

  private notice(page: Page | undefined, notice: Notice): void {
    const live =
      page !== undefined && !page.disposed
        ? page
        : (this.livePage(
            page === undefined ? undefined : this.windowsOfPages.get(page),
          ) ?? this.livePage(this.focusedWindow));
    const message = { type: 'notice', ...notice } as const;
    if (live === undefined) {
      this.unsentNotices = addNotice(this.unsentNotices, message);
      return;
    }
    live.post(message);
  }

  private async offerCommand(page: Page): Promise<void> {
    let state: CommandState;
    try {
      state = await this.host.commandState();
    } catch (error) {
      this.log.error(strings.log.checkingCommandFailed);
      this.log.error(error instanceof Error ? error : String(error));
      return;
    }
    if (state !== 'missing' || this.storage.commandOffered) {
      return;
    }
    this.save(this.storage.setCommandOffered());
    this.notice(page, {
      level: 'info',
      message: strings.messages.offerCommand,
    });
  }

  private async installCommand(page: Page): Promise<void> {
    if (!this.host.canInstallCommand()) {
      return;
    }
    let installed: CommandInstall;
    try {
      installed = await this.host.installCommand();
    } catch (error) {
      this.log.error(strings.log.installingCommandFailed);
      this.log.error(error instanceof Error ? error : String(error));
      this.notice(page, {
        level: 'error',
        message: strings.messages.couldNotInstallCommand(reasonOf(error)),
      });
      return;
    }
    const notice = commandNotice(installed);
    if (notice) {
      this.notice(page, notice);
    }
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }
}
