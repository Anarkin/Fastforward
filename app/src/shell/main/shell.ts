import type { Log } from './log';
import { lookedPaths, type PathLooks } from '../../lib/shared/partLooks';
import { isImageView, isTextView } from '../shared/views';
import type { DragEvent, Visit } from './dragEvents';
import { InFlight } from '../../lib/main/inFlight';
import type {
  AboutInfo,
  ToHost,
  ToWebview,
  UpdateStatus,
} from '../shared/protocol';
import { strings } from '../../lib/shared/strings';
import type { Sentence } from '../../lib/shared/sentences';
import {
  isTool,
  tools as toolIds,
  type ToHostOf,
  type ToolId,
} from '../shared/tools';
import type { Storage } from './storage';
import { TabHistory } from './tabHistory';
import { activeTabOf } from './windows';
import { ToolChoosing } from './toolChoosing';
import {
  CommandOffer,
  type CommandInstall,
  type CommandState,
} from './commandOffer';
import { Pages } from './pages';
import { TabMoves } from './tabMoves';
import { Closing } from './closing';
import { Tabs } from './tabs';
import { TabViews } from './tabViews';
import type { Notice, Page, ShellAccess, Tools } from './toolContract';

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
  partLooks(paths: readonly string[]): Promise<readonly PathLooks[]>;
}

export interface Connection {
  receive(message: ToHost): Promise<void>;
  dropped(files: unknown, tool: unknown, message: unknown): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

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
  private lastPageLog: string | undefined;
  private readonly inFlight = new InFlight();
  private readonly history = new TabHistory();
  private readonly choosing: ToolChoosing;
  private readonly command: CommandOffer;
  private readonly moves: TabMoves;
  private readonly closing: Closing;
  private readonly tabs: Tabs;
  private readonly views: TabViews;

  constructor(
    private readonly log: Log,
    private readonly storage: Storage,
    private readonly host: ShellHost,
    private readonly tools: Tools,
  ) {
    this.pages = new Pages(storage, tools);
    this.views = new TabViews(
      (page, tab) =>
        this.pages.windowOf(page).tabs.some((each) => each.id === tab),
      () => this.pages.all(),
    );
    this.tabs = new Tabs(storage, tools, this.pages, this.history, this.views, {
      showWindow: (window) => host.showWindow(window),
      closeWindow: (window) => host.closeWindow(window),
      save: (saving) => this.save(saving),
    });
    this.closing = new Closing(storage, tools, this.pages);
    this.moves = new TabMoves(storage, host, this.pages, this.history, {
      show: (page, tab) => this.tabs.show(page, tab),
      release: (page, tab) => this.views.release(page, tab),
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
      tabsOf: (page) => this.pages.windowOf(page).tabs,
      active: (page) => this.pages.activeTab(page),
      holds: (page, tab) =>
        this.pages.windowOf(page).tabs.some((each) => each.id === tab),
      shown: () =>
        this.storage.layout.flatMap((window) => {
          const tab = activeTabOf(window);
          return tab === undefined
            ? []
            : [{ page: this.pages.of(window.id), tab }];
        }),
      open: (page, tool, roots, reuse) =>
        this.tabs.open(page, tool, roots, reuse),
      openView: (page, file) => this.tabs.open(page, 'viewer', [file], false),
      openEdit: (page, tool, file) =>
        this.tabs.open(page, tool, [file], true, { edit: true }),
      editViewed: (page, tab) => this.tabs.editViewed(page, tab),
      openCompare: (page, tool, compare) =>
        this.tabs.open(page, tool, [undefined], false, { compare }),
      openFolders: (page, tool, folders) =>
        this.tools[tool].open(page, folders),
      setRoot: (tab, root) => this.tabs.setRoot(tab, root),
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
        this.views.gone(page);
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
      this.views.drop(tab.id);
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
        await this.tabs.open(
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
        await this.tabs.open(
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
      case 'partLooks': {
        const paths = lookedPaths(message.paths);
        if (paths !== undefined) {
          page.post({ type: 'partLooks', looks: await host.partLooks(paths) });
        }
        return;
      }
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
        await this.tabs.show(page, tab.id);
        return;
      }
      case 'closeTab': {
        const closing = this.pages
          .windowOf(page)
          .tabs.filter((tab) => tab.id === message.tab);
        if (
          message.save === true &&
          !(await this.closing.savedAll(page, closing))
        ) {
          return;
        }
        await this.tabs.close(page, message.tab);
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
      case 'keepView':
        this.views.keep(page, message.tab, message.view);
        return;
      case 'released':
        this.views.released(page, message.tab, message.view);
        return;
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
    page.post({ type: 'fileColors', groups: storage.fileColors });
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
    this.views.ready(page);
    for (const tool of toolIds) {
      this.tools[tool].ready(page);
    }
    this.pages.showing(window.id, page);
    this.tabs.forgetShown(page);
    await this.tabs.show(page, window.active);
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

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }
}
