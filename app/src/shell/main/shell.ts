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
import type {
  AboutInfo,
  ToHost,
  ToWebview,
  ToWebviewOf,
  UpdateStatus,
} from '../shared/protocol';
import { strings, type Sentence } from '../../lib/shared/strings';
import {
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
  windowOf,
  withActive,
  withChanged,
  withClosed,
  withOpened,
} from './windows';
import { ToolChoosing } from './toolChoosing';
import { CommandOffer } from './commandOffer';
import { Pages } from './pages';
import { TabMoves } from './tabMoves';
import { Closing } from './closing';

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
  private readonly pages: Pages;
  private readonly shownTools = new WeakMap<Page, ToolId>();
  private lastPageLog: string | undefined;
  private readonly inFlight = new InFlight();
  private readonly history = new TabHistory();
  private readonly choosing: ToolChoosing;
  private readonly command: CommandOffer;
  private readonly moves: TabMoves;
  private readonly closing: Closing;

  constructor(
    private readonly log: Log,
    private readonly storage: Storage,
    private readonly host: ShellHost,
    private readonly tools: Tools,
  ) {
    this.pages = new Pages(storage, tools);
    this.closing = new Closing(storage, tools, this.pages);
    this.moves = new TabMoves(storage, host, this.pages, this.history, {
      show: (page, tab) => this.show(page, tab),
      save: (saving) => this.save(saving),
    });
    this.choosing = new ToolChoosing(tools, {
      activeTab: (page) => this.pages.activeTab(page),
      notice: (page, notice) => this.pages.notice(page, notice),
    });
    this.command = new CommandOffer({
      shellHost: host,
      storage,
      log,
      notice: (page, notice) => this.pages.notice(page, notice),
      save: (saving) => this.save(saving),
    });
    const access: ShellAccess = {
      page: () => this.pages.focused(),
      pages: () => this.pages.all(),
      current: (page) => this.pages.current(page),
      tabs: () => this.storage.savedTabs,
      active: (page) => this.pages.activeTab(page),
      shown: () =>
        this.storage.layout.flatMap((window) => {
          const tab = activeTabOf(window);
          return tab === undefined
            ? []
            : [{ page: this.pages.of(window.id), tab }];
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
      postTabs: (page) => this.pages.postTabs(page),
      notice: (page, notice) => this.pages.notice(page, notice),
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
    this.pages.connected(page, window);
    return {
      receive: (message) =>
        isMessage(message)
          ? this.inFlight.track(
              this.handle(message, page).catch((error: unknown) => {
                this.log.error(strings.log.handlingFailed(message.type));
                this.log.error(error);
                this.pages.notice(page, {
                  level: 'error',
                  message: reasonOf(error),
                });
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
            this.pages.notice(page, {
              level: 'error',
              message: reasonOf(error),
            });
          }),
        );
      },
      refresh: () => {
        const tab = this.pages.activeTab(page);
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
        this.pages.disconnected(page, window);
      },
    };
  }

  openFolders(folders: readonly string[]): Promise<void> {
    this.log.info(strings.log.openingAsked(folders.join(', ')));
    this.choosing.asked(folders);
    const page = this.pages.focused();
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
    return this.closing.asksBeforeQuit();
  }

  askToQuit(): void {
    this.closing.askToQuit();
  }

  notify(notice: Notice): void {
    this.pages.notice(undefined, notice);
  }

  focus(window: string): void {
    this.pages.focus(window);
  }

  asksBeforeClosing(window: string): boolean {
    return this.closing.asksBeforeClosing(window);
  }

  askToCloseWindow(window: string): boolean {
    return this.closing.askToCloseWindow(window);
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
    const page = this.pages.of(window) ?? closedPage;
    for (const tab of closing.tabs) {
      this.history.forget(tab.id);
      this.tools[tab.tool].closed(page, tab);
    }
    this.pages.postWindows();
  }

  tearOff(tab: string, into: string): Promise<boolean> {
    return this.moves.tearOff(tab, into);
  }

  moveTab(tab: string, into: string, index: number): Promise<void> {
    return this.moves.moveTab(tab, into, index);
  }

  visit(window: string, visit: Visit | undefined): void {
    this.moves.visit(window, visit);
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
        await this.command.install(page);
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
          !(await this.closing.savedAll(page, this.storage.savedTabs))
        ) {
          return;
        }
        host.quit();
        return;
      case 'closeWindow': {
        const window = this.pages.windowOf(page);
        if (
          message.save === true &&
          !(await this.closing.savedAll(page, window.tabs))
        ) {
          return;
        }
        host.closeWindow(window.id);
        return;
      }
      case 'newWindow':
      case 'moveTabToWindow':
      case 'tearTab':
      case 'dragTabTo':
      case 'dropTab':
      case 'cancelTabDrag':
      case 'tabStrip':
      case 'visitIndex':
      case 'moveTab':
        await this.moves.receive(page, message);
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
        const window = this.pages.windowOf(page);
        const tab = window.tabs.find((each) => each.id === message.tab);
        if (
          tab === undefined ||
          (tab.id === window.active &&
            this.pages.of(window.id) === page &&
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
        if (
          message.save === true &&
          !(await this.closing.savedAll(page, closing))
        ) {
          return;
        }
        await this.close(page, message.tab);
        return;
      }
      case 'preloadTab': {
        const window = this.pages.windowOf(page);
        const tab = window.tabs.find((each) => each.id === message.tab);
        if (tab !== undefined && tab.id !== window.active) {
          await this.tools[tab.tool].preload(page, tab);
        }
        return;
      }
      case 'setTextView':
        if (!isTextView(message.view)) {
          return;
        }
        this.save(storage.setTextView(message.view));
        this.pages.postToAll({ type: 'textView', view: storage.textView });
        return;
      case 'setImageView':
        if (!isImageView(message.view)) {
          return;
        }
        this.save(storage.setImageView(message.view));
        this.pages.postToAll({ type: 'imageView', view: storage.imageView });
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
    const window = this.pages.windowOf(page);
    const laidOut = this.pages.laidOut(window.id);
    if (laidOut) {
      this.tellProblems(page);
    }
    for (const tool of toolIds) {
      this.tools[tool].ready(page);
    }
    this.pages.showing(window.id, page);
    this.shownTools.delete(page);
    await this.show(page, window.active);
    if (laidOut) {
      await this.choosing.askFolders(page);
    }
  }

  private tellProblems(page: Page): void {
    const { storage, host } = this;
    if (host.canInstallCommand() && !storage.commandOffered) {
      void this.inFlight.track(this.command.offer(page));
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
    const window = this.pages.windowOf(page);
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
    this.pages.showing(window.id, page);
    this.pages.postTabs(page);
    this.pages.postUnsentNotices(window.id, page);
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
    const window = this.pages.windowOf(page);
    const closed = window.tabs.find((tab) => tab.id === id);
    if (closed === undefined) {
      this.pages.postTabs(page);
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
      this.pages.postWindows();
      return;
    }
    if (active === activeId && active !== undefined) {
      this.pages.postTabs(page);
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
    const window = this.pages.windowOf(page);
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
    const live = page.disposed ? (this.pages.of(window.id) ?? page) : page;
    const last = opened.at(-1);
    if (last === undefined) {
      this.pages.postTabs(live);
      return;
    }
    const holder = windowOf(storage.layout, last);
    if (holder === undefined || holder.id === window.id) {
      await this.show(live, last);
      return;
    }
    this.host.showWindow(holder.id);
    const there = this.pages.live(holder.id);
    if (there === undefined) {
      this.save(storage.setLayout(withActive(storage.layout, holder.id, last)));
      this.pages.postTabs(live);
      return;
    }
    await this.show(there, last);
  }

  private async editViewed(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const viewed = this.pages
      .windowOf(page)
      .tabs.find((tab) => tab.id === id && tab.view === true);
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
    const page = this.pages.live(windowOf(storage.layout, id)?.id);
    if (page !== undefined) {
      this.pages.postTabs(page);
    }
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }
}
