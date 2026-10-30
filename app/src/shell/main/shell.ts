import * as path from 'node:path';
import type { Log } from './log';
import type { CommandInstall, CommandState } from '../../main/terminalCommand';
import { InFlight } from '../../shared/inFlight';
import { addNotice } from '../shared/notices';
import type {
  AboutInfo,
  TabInfo,
  ToHost,
  ToolChoice,
  ToWebview,
  ToWebviewOf,
  UpdateStatus,
} from '../shared/protocol';
import { strings } from '../../shared/strings';
import {
  confirmsClose,
  isTool,
  tools as toolIds,
  type ToHostOf,
  type ToolId,
} from '../shared/tools';
import { sameRoot, type SavedTab, type Storage } from './storage';

export interface Page {
  post(message: ToWebview): void;
  readonly disposed: boolean;
}

export type Tab = SavedTab;

export interface TabName {
  readonly name: string;
  readonly folder?: string;
}

export type Notice = Omit<ToWebviewOf<'notice'>, 'type'>;

export interface ShellAccess {
  page(): Page | undefined;
  tabs(): readonly Tab[];
  active(): Tab | undefined;
  open(
    page: Page,
    tool: ToolId,
    roots: readonly (string | undefined)[],
    reuse: boolean,
  ): Promise<void>;
  setRoot(tab: string, root: string): void;
  visited(folder: string): void;
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
  refreshShown(page: Page): Promise<void>;
  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName>;
  fits(folder: string): Promise<boolean>;
  folderOf(tab: Tab): string | undefined;
  visited(folder: string): void;
  open(page: Page, folders: readonly string[]): Promise<void>;
  newTab(page: Page): Promise<void>;
  reloadSettings(): void;
  quit(): void;
}

export type Tools = { readonly [K in ToolId]: Tool<K> };

export interface ShellHost {
  openSettings(): Promise<void>;
  openDefaultSettings(): Promise<void>;
  settingsProblems(): readonly string[];
  checkForUpdates(): void;
  installUpdate(): void;
  quit(): void;
  updateStatus(): UpdateStatus;
  about(): AboutInfo;
  copyText(text: string): void;
  canInstallCommand(): boolean;
  commandState(): Promise<CommandState>;
  installCommand(): Promise<CommandInstall>;
}

export interface Connection {
  receive(message: ToHost): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

interface Asking {
  readonly question: ToWebviewOf<'chooseTool'>;
  readonly fitting: ReadonlySet<ToolId>;
}

export const unattachedShell: ShellAccess = {
  page: () => undefined,
  tabs: () => [],
  active: () => undefined,
  open: () => Promise.resolve(),
  setRoot: () => undefined,
  visited: () => undefined,
  postTabs: () => undefined,
  notice: () => undefined,
  track: (work) => work,
  idle: () => Promise.resolve(),
};

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

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Shell {
  private page: Page | undefined;
  private shownTool: ToolId | undefined;
  private askedFolders: readonly string[] = [];
  private asking: Asking | undefined;
  private askingFolders: Promise<void> = Promise.resolve();
  private unsentNotices: readonly ToWebviewOf<'notice'>[] = [];
  private readonly inFlight = new InFlight();

  constructor(
    private readonly log: Log,
    private readonly storage: Storage,
    private readonly host: ShellHost,
    private readonly tools: Tools,
  ) {
    const access: ShellAccess = {
      page: () => this.page,
      tabs: () => this.storage.savedTabs,
      active: () => this.activeTab(),
      open: (page, tool, roots, reuse) => this.open(page, tool, roots, reuse),
      setRoot: (tab, root) => this.setRoot(tab, root),
      visited: (folder) => {
        for (const tool of toolIds) {
          this.tools[tool].visited(folder);
        }
      },
      postTabs: (page) => this.postTabs(page),
      notice: (page, notice) => this.notice(page, notice),
      track: (work) => this.inFlight.track(work),
      idle: () => this.idle(),
    };
    for (const tool of toolIds) {
      this.tools[tool].attach(access);
    }
  }

  connect(post: (message: ToWebview) => void): Connection {
    const page = {
      post: (message: ToWebview) => {
        if (!page.disposed) {
          post(message);
        }
      },
      disposed: false,
    };
    return {
      receive: (message) =>
        this.inFlight.track(
          this.handle(message, page).catch((error: unknown) => {
            this.log.error(strings.log.handlingFailed(message.type));
            this.log.error(error);
            this.notice(page, { level: 'error', message: reasonOf(error) });
          }),
        ),
      refresh: () => {
        const tab = this.activeTab();
        return tab === undefined
          ? Promise.resolve()
          : this.inFlight.track(this.tools[tab.tool].refreshShown(page));
      },
      dispose: () => {
        page.disposed = true;
        for (const tool of toolIds) {
          this.tools[tool].hide(page);
        }
      },
    };
  }

  openFolders(folders: readonly string[]): Promise<void> {
    this.log.info(strings.log.openingAsked(folders.join(', ')));
    this.askedFolders = [...this.askedFolders, ...folders];
    const { page } = this;
    if (page === undefined || page.disposed) {
      return Promise.resolve();
    }
    return this.inFlight.track(
      this.askFolders(page).catch((error: unknown) => {
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
    const { page } = this;
    return (
      page !== undefined &&
      !page.disposed &&
      this.storage.savedTabs.some((tab) => confirmsClose[tab.tool])
    );
  }

  askToQuit(): void {
    this.page?.post({ type: 'confirmQuit' });
  }

  private activeTab(): Tab | undefined {
    const { savedTabs, activeTabId } = this.storage;
    return savedTabs.find((tab) => tab.id === activeTabId);
  }

  private tabOf(id: unknown): Tab | undefined {
    return this.storage.savedTabs.find((tab) => tab.id === id);
  }

  private async handle(message: ToHost, page: Page): Promise<void> {
    const { storage, host } = this;
    switch (message.type) {
      case 'ready':
        await this.ready(page);
        return;
      case 'openSettings':
        await host.openSettings();
        return;
      case 'openDefaultSettings':
        await host.openDefaultSettings();
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
        host.quit();
        return;
      case 'copyText':
        if (typeof message.text === 'string') {
          host.copyText(message.text);
        }
        return;
      case 'log':
        if (
          (message.level === 'info' || message.level === 'error') &&
          typeof message.message === 'string'
        ) {
          this.log[message.level](strings.log.webview(message.message));
        }
        return;
      case 'selectTab': {
        const tab = this.tabOf(message.tab);
        if (
          tab === undefined ||
          (tab.id === this.activeTab()?.id &&
            this.page === page &&
            this.tools[tab.tool].shows(page, tab))
        ) {
          return;
        }
        await this.show(page, tab.id);
        return;
      }
      case 'closeTab':
        await this.close(page, message.tab);
        return;
      case 'preloadTab': {
        const tab = this.tabOf(message.tab);
        if (tab !== undefined && tab.id !== this.activeTab()?.id) {
          await this.tools[tab.tool].preload(page, tab);
        }
        return;
      }
      case 'sortTabs':
        this.save(
          storage.setSavedTabs(
            this.sorted(storage.savedTabs),
            storage.activeTabId,
          ),
        );
        this.postTabs(page);
        return;
      case 'moveTab': {
        const tabs = storage.savedTabs;
        const from = tabs.findIndex((tab) => tab.id === message.tab);
        if (
          !storage.autoSortTabs &&
          from !== -1 &&
          Number.isInteger(message.index) &&
          message.index >= 0 &&
          message.index < tabs.length
        ) {
          this.save(
            storage.setSavedTabs(
              tabs.toSpliced(from, 1).toSpliced(message.index, 0, tabs[from]),
              storage.activeTabId,
            ),
          );
        }
        this.postTabs(page);
        return;
      }
      case 'setAutoSortTabs':
        if (typeof message.on !== 'boolean') {
          return;
        }
        this.save(storage.setAutoSortTabs(message.on));
        if (message.on) {
          this.save(
            storage.setSavedTabs(
              this.sorted(storage.savedTabs),
              storage.activeTabId,
            ),
          );
          this.postTabs(page);
        }
        return;
      case 'newTab':
        if (isTool(message.tool)) {
          await this.tools[message.tool].newTab(page);
        }
        return;
      case 'openWith':
        await this.openWith(page, message.tool);
        return;
      case 'openIn':
        await this.openIn(page);
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
    page.post({ type: 'autoSortTabs', on: storage.autoSortTabs });
    page.post({ type: 'update', status: host.updateStatus() });
    page.post({ type: 'about', ...host.about() });
    page.post({
      type: 'terminalCommand',
      installable: host.canInstallCommand(),
    });
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
    for (const tool of toolIds) {
      this.tools[tool].ready(page);
    }
    this.page = page;
    this.shownTool = undefined;
    this.save(
      storage.setSavedTabs(
        this.ordered(storage.savedTabs),
        storage.activeTabId,
      ),
    );
    await this.show(page, storage.activeTabId);
    await this.askFolders(page);
  }

  private async show(page: Page, id: string | undefined): Promise<void> {
    const { storage } = this;
    const tabs = storage.savedTabs;
    const active = tabs.find((tab) => tab.id === id) ?? tabs.at(0);
    this.save(storage.setSavedTabs(tabs, active?.id));
    if (page.disposed) {
      return;
    }
    this.page = page;
    this.postTabs(page);
    const unsent = this.unsentNotices;
    this.unsentNotices = [];
    for (const notice of unsent) {
      page.post(notice);
    }
    const shown = this.shownTool;
    this.shownTool = active?.tool;
    if (shown !== undefined && shown !== active?.tool) {
      this.tools[shown].hide(page);
    }
    if (active !== undefined) {
      await this.tools[active.tool].show(page, active);
    }
  }

  private async close(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const tabs = storage.savedTabs;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) {
      this.postTabs(page);
      return;
    }
    const closed = tabs[index];
    const rest = tabs.toSpliced(index, 1);
    const activeId = this.activeTab()?.id;
    const active =
      activeId === id
        ? rest.at(Math.min(index, rest.length - 1))?.id
        : activeId;
    this.save(storage.setSavedTabs(rest, active));
    this.tools[closed.tool].closed(page, closed);
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
  ): Promise<void> {
    const { storage } = this;
    const tabs = storage.savedTabs;
    const added: Tab[] = [];
    const opened: string[] = [];
    let next = nextId(tabs);
    for (const root of roots) {
      const existing = reuse
        ? [...tabs, ...added].find(
            (tab) =>
              tab.tool === tool &&
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
      };
      added.push(tab);
      opened.push(tab.id);
    }
    this.save(
      storage.setSavedTabs(
        this.ordered([...tabs, ...added]),
        storage.activeTabId,
      ),
    );
    const live = page.disposed ? (this.page ?? page) : page;
    const last = opened.at(-1);
    if (last === undefined) {
      this.postTabs(live);
      return;
    }
    await this.show(live, last);
  }

  private setRoot(id: string, root: string): void {
    const { storage, page } = this;
    const tabs = storage.savedTabs;
    if (!tabs.some((tab) => tab.id === id && tab.root !== root)) {
      return;
    }
    this.save(
      storage.setSavedTabs(
        tabs.map((tab) => (tab.id === id ? { ...tab, root } : tab)),
        storage.activeTabId,
      ),
    );
    if (page !== undefined && !page.disposed) {
      this.postTabs(page);
    }
  }

  private askFolders(page: Page): Promise<void> {
    return this.inTurn(() => this.ask(page));
  }

  private openIn(page: Page): Promise<void> {
    const tab = this.activeTab();
    if (tab === undefined) {
      return Promise.resolve();
    }
    const folder = this.tools[tab.tool].folderOf(tab);
    if (folder === undefined) {
      this.notice(page, {
        level: 'info',
        message: strings.messages.noFolder(strings.tools[tab.tool]),
      });
      return Promise.resolve();
    }
    return this.inTurn(() => this.choose(page, [folder], tab.tool));
  }

  private inTurn(asking: () => Promise<void>): Promise<void> {
    this.askingFolders = this.askingFolders.catch(() => undefined).then(asking);
    return this.askingFolders;
  }

  private async ask(page: Page): Promise<void> {
    const folders = [
      ...(this.asking?.question.folders ?? []),
      ...this.askedFolders,
    ].filter(
      (folder, index, all) =>
        all.findIndex((other) => sameRoot(other, folder)) === index,
    );
    this.askedFolders = [];
    if (folders.length === 0) {
      return;
    }
    await this.choose(page, folders, undefined);
  }

  private async choose(
    page: Page,
    folders: readonly string[],
    asker: ToolId | undefined,
  ): Promise<void> {
    const fits = await Promise.all(
      toolIds.map(async (tool) => ({
        tool,
        folders: await Promise.all(
          folders.map(
            async (folder) =>
              tool !== asker &&
              (await this.tools[tool].fits(folder).catch(() => false)),
          ),
        ),
      })),
    );
    const opened = folders.filter((_, index) =>
      fits.some((fit) => fit.folders[index]),
    );
    for (const folder of folders) {
      if (!opened.includes(folder)) {
        this.notice(page, {
          level: 'error',
          message: strings.messages.noToolOpens(folder),
        });
      }
    }
    if (opened.length === 0) {
      this.asking = undefined;
      return;
    }
    const choices: ToolChoice[] = fits.map((fit) => ({
      tool: fit.tool,
      fits: fit.folders.some(Boolean),
    }));
    const picked =
      fits.find((fit) =>
        opened.every((folder) => fit.folders[folders.indexOf(folder)]),
      )?.tool ?? choices.find((choice) => choice.fits)?.tool;
    this.asking = {
      question: { type: 'chooseTool', folders: opened, choices, picked },
      fitting: new Set(
        choices.filter((choice) => choice.fits).map((choice) => choice.tool),
      ),
    };
    page.post(this.asking.question);
  }

  private async openWith(page: Page, tool: unknown): Promise<void> {
    const { asking } = this;
    if (asking === undefined) {
      return;
    }
    if (tool === undefined) {
      this.asking = undefined;
      return;
    }
    if (!isTool(tool) || !asking.fitting.has(tool)) {
      page.post(asking.question);
      return;
    }
    this.asking = undefined;
    await this.tools[tool].open(page, asking.question.folders);
  }

  private postTabs(page: Page): void {
    page.post({
      type: 'tabs',
      tabs: this.infos(this.storage.savedTabs),
      active: this.activeTab()?.id,
    });
  }

  private infos(tabs: readonly Tab[]): TabInfo[] {
    const names = new Map(
      toolIds.flatMap((tool) => [
        ...this.tools[tool].names(tabs.filter((tab) => tab.tool === tool)),
      ]),
    );
    return tabs.map(({ id, tool, root }) => {
      const name = names.get(id);
      return {
        id,
        tool,
        name: name?.name ?? strings.tools[tool],
        ...(name?.folder !== undefined && { folder: name.folder }),
        ...(root !== undefined && { root }),
      };
    });
  }

  private ordered(tabs: readonly Tab[]): readonly Tab[] {
    return this.storage.autoSortTabs ? this.sorted(tabs) : tabs;
  }

  private sorted(tabs: readonly Tab[]): Tab[] {
    const labels = new Map(
      this.infos(tabs).map((tab) => [
        tab.id,
        strings.tabs.label(tab.name, tab.folder),
      ]),
    );
    return tabs.toSorted((a, b) =>
      (labels.get(a.id) ?? a.id).localeCompare(
        labels.get(b.id) ?? b.id,
        undefined,
        {
          sensitivity: 'base',
        },
      ),
    );
  }

  private notice(page: Page | undefined, notice: Notice): void {
    const live = page === undefined || page.disposed ? this.page : page;
    const message = { type: 'notice', ...notice } as const;
    if (live === undefined || live.disposed) {
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

function nextId(tabs: readonly Tab[]): number {
  return (
    Math.max(0, ...tabs.map((tab) => Number(tab.id)).filter(Number.isInteger)) +
    1
  );
}
