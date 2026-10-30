import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach } from 'vitest';
import {
  collapseThreshold,
  type GitToHost,
  type GitToWebview,
  type Bookmark,
  type RepositoryInfo,
  type WorktreeInfo,
} from '../tools/git/shared/protocol';
import type {
  AboutInfo,
  ToHost,
  ToWebview,
  UpdateStatus,
} from '../shell/shared/protocol';
import type { Timer } from '../tools/git/main/autoFetch';
import { nodeFileSystem } from '../tools/commander/main/nodeFileSystem';
import { CommanderTool } from '../tools/commander/main/tool';
import { TerminalTool, type HostListener } from '../tools/terminal/main/tool';
import {
  GitTool,
  refreshDelays,
  type FolderPurpose,
  type GitHost,
} from '../tools/git/main/tool';
import type { Log } from '../shell/main/log';
import type { CommandInstall, CommandState } from '../main/terminalCommand';
import { Shell, type ShellHost } from '../shell/main/shell';
import {
  activeTabKey,
  sameRoot,
  Storage,
  tabsKey,
  toolState,
  type Store,
} from '../shell/main/storage';
import { GitStorage } from '../tools/git/main/storage';
import { UserSettings } from '../shell/main/settings';
import { FakeStore } from './fakeStore';
import { defaultSettings } from './fixtures';
import {
  installedGit,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

export type PageMessage =
  Exclude<ToWebview, { readonly type: 'tool' }> | GitToWebview;

export type PageMessageOf<T extends PageMessage['type']> = Extract<
  PageMessage,
  { readonly type: T }
>;

export class FakePage {
  readonly messages: PageMessage[] = [];
  readonly listeners = new Set<(message: PageMessage) => void>();
  tabs: PageMessageOf<'tabs'> | undefined;

  receive(sent: ToWebview): void {
    if (sent.type === 'tool' && sent.tool !== 'git') {
      return;
    }
    const message = sent.type === 'tool' ? sent.message : sent;
    if (message.type === 'tabs') {
      this.tabs = message;
    }
    this.messages.push(message);
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  last<T extends PageMessage['type']>(type: T): PageMessageOf<T> | undefined {
    return this.messages.findLast(
      (message): message is PageMessageOf<T> => message.type === type,
    );
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export interface Connection {
  receive(message: ToHost | GitToHost): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

export interface OpenView {
  view: GitTool;
  shell: Shell;
  page: FakePage;
  connection: Connection;
  store: FakeStore;
  settings: UserSettings;
}

export class FakeHost implements ShellHost, GitHost {
  folders: readonly string[] = [];
  folder: string | undefined;
  readonly foldersAsked: [FolderPurpose, string | undefined][] = [];
  clipboard = '';
  problems: readonly string[] = [];
  update: UpdateStatus = { kind: 'idle' };
  commandPlace = false;
  command: CommandState = 'missing';
  installs: CommandInstall | Error = {
    kind: 'installed',
    path: '/usr/local/bin/ff',
    onPath: true,
  };
  readonly opened: string[] = [];

  canInstallCommand(): boolean {
    return this.commandPlace;
  }

  commandState(): Promise<CommandState> {
    return Promise.resolve(this.command);
  }

  installCommand(): Promise<CommandInstall> {
    this.opened.push('install command');
    return this.installs instanceof Error
      ? Promise.reject(this.installs)
      : Promise.resolve(this.installs);
  }

  chooseFolders(): Promise<readonly string[]> {
    return Promise.resolve(this.folders);
  }

  chooseFolder(
    purpose: FolderPurpose,
    from?: string,
  ): Promise<string | undefined> {
    this.foldersAsked.push([purpose, from]);
    return Promise.resolve(this.folder);
  }

  clipboardText(): Promise<string> {
    return Promise.resolve(this.clipboard);
  }

  openSettings(): Promise<void> {
    this.opened.push('settings');
    return Promise.resolve();
  }

  openDefaultSettings(): Promise<void> {
    this.opened.push('defaults');
    return Promise.resolve();
  }

  settingsProblems(): readonly string[] {
    return this.problems;
  }

  checkForUpdates(): void {
    this.opened.push('update check');
  }

  installUpdate(): void {
    this.opened.push('update install');
  }

  quit(): void {
    this.opened.push('quit');
  }

  updateStatus(): UpdateStatus {
    return this.update;
  }

  about(): AboutInfo {
    return {
      version: '1.2.3',
      development: true,
      git: '2.52.0',
      system: 'Windows 11, build 26300, x64',
    };
  }

  copyText(text: string): void {
    this.opened.push(`copy ${text}`);
  }
}

export async function withNotices(
  page: FakePage,
  level: 'info' | 'error',
  run: (messages: string[]) => Promise<void>,
): Promise<void> {
  const messages: string[] = [];
  const listener = (message: PageMessage) => {
    if (message.type === 'notice' && message.level === level) {
      messages.push(message.message);
    }
  };
  page.listeners.add(listener);
  try {
    await run(messages);
  } finally {
    page.listeners.delete(listener);
  }
}

export function settingsForViews(): UserSettings {
  const defaults = defaultSettings();
  return new UserSettings({
    ...defaults,
    autoSortTabs: false,
    tools: {
      ...defaults.tools,
      git: { ...defaults.tools.git, autoFetch: false },
    },
  });
}

const quickerRefreshDelays = { delay: refreshDelays.delay, maxDelay: 500 };

export interface Opening {
  readonly ready?: boolean;
  readonly watched?: boolean;
}

export async function openView(
  log: Log,
  tabs: readonly string[],
  opening: boolean | Opening = {},
  host: ShellHost & GitHost = new FakeHost(),
  timer?: Timer,
  gitPath?: string,
): Promise<OpenView> {
  const { ready = true, watched = false } =
    typeof opening === 'boolean' ? { ready: opening } : opening;
  const store = new FakeStore();
  await saveTabs(store, tabs);
  const settings = settingsForViews();
  const view = newView(
    log,
    gitPath ?? (await installedGit()),
    settings,
    store,
    host,
    timer,
  );
  const { page, connection } = attach(view);
  if (!watched) {
    stubMethod(view, 'watch', () => Promise.resolve());
  }
  if (ready) {
    await connection.receive({ type: 'ready' });
    await view.idle();
  }
  return { view, shell: shellOf(view), page, connection, store, settings };
}

export async function saveTabs(
  store: FakeStore,
  roots: readonly string[],
  active = roots.at(0),
): Promise<void> {
  await store.update(
    tabsKey,
    roots.map((root, index) => ({ id: String(index + 1), tool: 'git', root })),
  );
  const index = active === undefined ? -1 : roots.indexOf(active);
  await store.update(
    activeTabKey,
    index === -1 ? undefined : String(index + 1),
  );
}

const shells = new WeakMap<GitTool, Shell>();
const terminalHosts = new WeakMap<GitTool, HostListener[]>();

export function newView(
  log: Log,
  gitPath: string,
  settings: UserSettings,
  store: Store,
  host: ShellHost & GitHost = new FakeHost(),
  timer?: Timer,
  delays = quickerRefreshDelays,
): GitTool {
  const view = new GitTool(
    log,
    gitPath,
    new GitStorage(settings, gitState(store)),
    host,
    timer,
    delays,
  );
  const hosts: HostListener[] = [];
  terminalHosts.set(view, hosts);
  shells.set(
    view,
    new Shell(log, new Storage(settings, store), host, {
      terminal: new TerminalTool(
        log,
        (listener) => {
          hosts.push(listener);
          return { send: () => {}, dispose: () => {} };
        },
        () => settings.settings.tools.terminal,
        () => ({ file: 'sh', args: [], cwd: '/', env: {} }),
        undefined,
        {
          store: toolState(store, 'terminal'),
          home: os.homedir(),
          isFolder: () => true,
          now: () => Date.now(),
          choose: () => host.chooseFolders(),
        },
      ),
      commander: new CommanderTool({
        fileSystem: () => Promise.resolve(nodeFileSystem),
        settings: () => settings.settings.tools.commander,
        defaultColumns: () => settings.defaults.tools.commander.columns,
        saveShowHidden: () => Promise.resolve(),
        saveColumns: () => Promise.resolve(),
        watch: () => () => {},
        fileIcon: () => Promise.resolve(new Uint8Array()),
        platform: process.platform,
        root: os.tmpdir(),
      }),
      git: view,
    }),
  );
  return view;
}

export function shellOf(view: GitTool): Shell {
  const shell = shells.get(view);
  assert.ok(shell);
  return shell;
}

export function terminalHostOf(view: GitTool): HostListener {
  const host = terminalHosts.get(view)?.at(-1);
  assert.ok(host, 'no terminal process was started');
  return host;
}

const shellMessages: Readonly<Record<ToHost['type'], true>> = {
  ready: true,
  selectTab: true,
  closeTab: true,
  moveTab: true,
  preloadTab: true,
  sortTabs: true,
  setAutoSortTabs: true,
  newTab: true,
  openWith: true,
  openIn: true,
  copyText: true,
  openSettings: true,
  openDefaultSettings: true,
  checkForUpdates: true,
  installUpdate: true,
  quit: true,
  installTerminalCommand: true,
  log: true,
  tool: true,
};

function isShellMessage(message: ToHost | GitToHost): message is ToHost {
  return Object.hasOwn(shellMessages, message.type);
}

export function tabOf(page: FakePage, root: string): string {
  const tab = page.tabs?.tabs.find(
    (info) => info.root !== undefined && sameRoot(info.root, root),
  );
  assert.ok(tab, root);
  return tab.id;
}

export interface ShownTabs {
  readonly tabs: readonly RepositoryInfo[];
  readonly active: string | undefined;
  readonly worktree: string | undefined;
  readonly worktrees: readonly WorktreeInfo[] | undefined;
  readonly recent: readonly RepositoryInfo[];
}

export function shownTabs(page: FakePage): ShownTabs | undefined {
  const tabs = page.last('tabs');
  if (tabs === undefined) {
    return undefined;
  }
  const worktrees = page.last('worktrees');
  return {
    tabs: tabs.tabs.flatMap(({ root, name, folder }) =>
      root === undefined
        ? []
        : [{ root, name, ...(folder !== undefined && { folder }) }],
    ),
    active: tabs.tabs.find((tab) => tab.id === tabs.active)?.root,
    worktree: worktrees?.worktree,
    worktrees: worktrees?.worktrees,
    recent: page.last('recent')?.recent ?? [],
  };
}

export async function withView(
  log: Log,
  tabs: readonly string[],
  run: (view: OpenView) => Promise<void>,
  opening: boolean | Opening = {},
  host?: ShellHost & GitHost,
  gitPath?: string,
): Promise<void> {
  const view = await openView(log, tabs, opening, host, undefined, gitPath);
  try {
    await run(view);
  } finally {
    view.connection.dispose();
    openGates();
    await view.view.idle();
  }
}

const openedViews = new Set<GitTool>();
const openedConnections = new Set<Connection>();

export async function closeViews(): Promise<void> {
  for (const connection of openedConnections) {
    connection.dispose();
  }
  openedConnections.clear();
  openGates();
  await Promise.all([...openedViews].map((view) => view.idle()));
  openedViews.clear();
}

export function attach(view: GitTool): {
  page: FakePage;
  connection: Connection;
} {
  const page = new FakePage();
  const opened = shellOf(view).connect((message) => page.receive(message));
  const connection: Connection = {
    receive: (message) =>
      opened.receive(
        isShellMessage(message)
          ? message
          : { type: 'tool', tool: 'git', message },
      ),
    refresh: () => opened.refresh(),
    dispose: () => opened.dispose(),
  };
  openedViews.add(view);
  openedConnections.add(connection);
  return { page, connection };
}

export function commitsSent(messages: readonly PageMessage[]): number {
  return messages.filter((message) => message.type === 'commits').length;
}

export function workingTreesSent(messages: readonly PageMessage[]): number {
  return messages.filter((message) => message.type === 'workingTree').length;
}

export function numberedLines(text: string): string {
  return Array.from(
    { length: collapseThreshold + 1 },
    (_, index) => `${text} ${index}\n`,
  ).join('');
}

const gates = new Set<() => void>();

export function gate(): { opened: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  const open = () => resolve();
  gates.add(open);
  return { opened: promise, open };
}

function openGates(): void {
  for (const open of gates) {
    open();
  }
  gates.clear();
}

export interface HeldFetches {
  readonly reached: () => boolean;
  readonly release: () => void;
  readonly restore: () => Promise<void>;
}

export async function holdFetches(
  repository: TempRepository,
  remote: string,
  folder: string,
): Promise<HeldFetches> {
  const inFolder = (name: string) =>
    path.join(folder, name).replaceAll('\\', '/');
  const opened = inFolder(`${remote}-fetch-opened`);
  const started = inFolder(`${remote}-fetch-started`);
  const uploadPack = inFolder(`${remote}-held-upload-pack.sh`);
  fs.writeFileSync(
    uploadPack,
    `#!/bin/sh\ntouch '${started}'\nwhile [ ! -e '${opened}' ]; do sleep 0.1; done\nexec git upload-pack "$@"\n`,
    { mode: 0o755 },
  );
  await repository.git('config', `remote.${remote}.uploadpack`, uploadPack);
  const release = () => fs.writeFileSync(opened, '');
  return {
    reached: () => fs.existsSync(started),
    release,
    restore: async () => {
      release();
      await repository.git('config', '--unset', `remote.${remote}.uploadpack`);
      for (const file of [opened, started, uploadPack]) {
        fs.rmSync(file, { force: true });
      }
    },
  };
}

export async function idleOnlyOnceOpened(
  view: GitTool,
  held: { open: () => void },
): Promise<void> {
  let idle = false;
  const idling = view.idle().then(() => {
    idle = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.strictEqual(idle, false);
  held.open();
  await idling;
}

export function stubMethod(
  view: GitTool,
  name: string,
  replace: (
    original: (...args: unknown[]) => Promise<unknown>,
    ...args: unknown[]
  ) => Promise<unknown>,
): void {
  const original: unknown = Reflect.get(view, name);
  assert.ok(typeof original === 'function', name);
  Reflect.set(view, name, (...args: unknown[]) =>
    replace(
      (...inner) => {
        const result: unknown = Reflect.apply(original, view, inner);
        return Promise.resolve(result);
      },
      ...args,
    ),
  );
}

export function failOnErrorsLogged(logged: unknown[]): void {
  afterEach(() => {
    assert.deepStrictEqual(logged.splice(0), []);
  });
}

export function takeErrorsLogged(
  logged: unknown[],
  ...expected: RegExp[]
): void {
  const messages = logged
    .splice(0)
    .map((entry) => (entry instanceof Error ? entry.message : String(entry)));
  for (const pattern of expected) {
    assert.ok(
      messages.some((message) => pattern.test(message)),
      `${pattern} in ${JSON.stringify(messages)}`,
    );
  }
  for (const message of messages) {
    assert.ok(
      expected.some((pattern) => pattern.test(message)),
      `unexpected error logged: ${message}`,
    );
  }
}

export function rootOf(context: unknown): string | undefined {
  return typeof context === 'object' &&
    context !== null &&
    'root' in context &&
    typeof context.root === 'string'
    ? context.root
    : undefined;
}

export async function deleteTags(repository: TempRepository): Promise<void> {
  const tags = (await repository.git('tag'))
    .split('\n')
    .filter((tag) => tag !== '');
  if (tags.length > 0) {
    await repository.git('tag', '-d', ...tags);
  }
}

export async function lockedRepository(root: string): Promise<{
  repository: TempRepository;
  asked: () => string[];
  close: () => Promise<void>;
}> {
  const repository = await tempRepository(root);
  await repository.commit('a');
  const asked = `${root}-asked.txt`.replaceAll('\\', '/');
  await repository.git('config', 'credential.helper', '');
  await repository.git(
    'config',
    '--add',
    'credential.helper',
    `!f() { test "$1" = get || exit 0; echo "[$GCM_INTERACTIVE]" >> '${asked}'; echo username=u; echo password=p; }; f`,
  );
  const server = createServer((_request, response) => {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null);
  await repository.git(
    'remote',
    'add',
    'origin',
    `http://127.0.0.1:${address.port}/x`,
  );
  return {
    repository,
    asked: () => fs.readFileSync(asked, 'utf8').trim().split('\n'),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function reopen(view: GitTool): {
  page: FakePage;
  connection: Connection;
  ready: Promise<void>;
} {
  const { page, connection } = attach(view);
  return { page, connection, ready: connection.receive({ type: 'ready' }) };
}

export function savedBookmarks(
  store: FakeStore,
  root: string,
): readonly Bookmark[] | undefined {
  return new GitStorage(
    new UserSettings(defaultSettings()),
    gitState(store),
  ).bookmarksOf(root);
}

export function gitState(store: Store): Store {
  return toolState(store, 'git');
}

export function fortyLines(changed: number): string {
  const lines = Array.from({ length: 40 }, (_, i) =>
    i === changed ? 'changed' : `line ${i + 1}`,
  );
  return `${lines.join('\n')}\n`;
}

export interface ViewRepositories {
  folder: string;
  repository: TempRepository;
  fixture: { a: string; b: string; f2: string; merge: string };
  other: string;
  otherHead: string;
}

export async function viewRepositories(): Promise<ViewRepositories> {
  const folder = tempFolder('view');
  const repository = await tempRepository(path.join(folder, 'main'));
  await repository.commit('a');
  await repository.git('checkout', '-b', 'feature');
  await repository.commit('f1');
  await repository.commit('f2');
  await repository.git('checkout', 'main');
  await repository.commit('b');
  await repository.git('merge', '--no-ff', 'feature', '-m', 'merge feature');
  const [a, b, f2, merge] = await repository.resolve(
    'main~2',
    'main~1',
    'feature',
    'main',
  );
  await repository.git('commit-graph', 'write', '--reachable');

  const second = await tempRepository(path.join(folder, 'other'));
  await second.commit('other');
  const [otherHead] = await second.resolve('HEAD');
  return {
    folder,
    repository,
    fixture: { a, b, f2, merge },
    other: second.root,
    otherHead,
  };
}

export async function restoreRepository(
  repository: TempRepository,
  merge: string,
): Promise<void> {
  await repository.git('checkout', '-f', 'main');
  await repository.git('reset', '--hard', merge);
}
