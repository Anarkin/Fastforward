import { strings } from '../../lib/shared/strings';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type GitToHost,
  type Bookmark,
  type RepositoryInfo,
  type WorktreeInfo,
} from '../../tools/git/shared/protocol';
import type { ToHost } from '../../shell/shared/protocol';
import type { Timer } from '../../lib/main/timer';
import { nodeFileSystem } from '../../tools/commander/main/nodeFileSystem';
import { isRepository } from '../../tools/commander/main/repositories';
import { CommanderTool } from '../../tools/commander/main/tool';
import { ViewerTool } from '../../tools/viewer/main/tool';
import { EditorTool } from '../../tools/editor/main/tool';
import { diffToolOf } from '../../boot/diffHost';
import type { DiffTool } from '../../tools/diff/main/tool';
import { TerminalTool } from '../../tools/terminal/main/tool';
import type { HostListener } from '../../tools/terminal/main/hostLink';
import {
  GitTool,
  refreshDelays,
  type GitHost,
} from '../../tools/git/main/tool';
import type { Log } from '../../shell/main/log';
import { Shell, type ShellHost } from '../../shell/main/shell';
import {
  activeTabKey,
  Storage,
  tabsKey,
  toolState,
} from '../../shell/main/storage';
import { sameRoot } from '../../lib/main/paths';
import type { Store } from '../../shell/main/stateFile';
import { GitStorage } from '../../tools/git/main/storage';
import { GitLocator } from '../../tools/git/main/gitLocator';
import { minimumGitVersion } from '../../tools/git/main/locate';
import { UserSettings } from '../../shell/main/userSettings';
import { FakeHost } from './fakeHost';
import { FakePage } from './fakePage';
import { FakeStore } from './fakeStore';
import { defaultSettings } from './fixtures';
import { installedGit } from './repositories';

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

export function settingsForViews(): UserSettings {
  const defaults = defaultSettings();
  return new UserSettings({
    ...defaults,
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
  git?: string | GitLocator,
): Promise<OpenView> {
  const { ready = true, watched = false } =
    typeof opening === 'boolean' ? { ready: opening } : opening;
  const store = new FakeStore();
  await saveTabs(store, tabs);
  const settings = settingsForViews();
  const view = newView(
    log,
    git ?? (await installedGit()),
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
const diffTools = new WeakMap<GitTool, DiffTool>();

export function diffOf(view: GitTool): DiffTool {
  const diff = diffTools.get(view);
  assert.ok(diff, 'the diff tool of the view');
  return diff;
}
const terminalHosts = new WeakMap<GitTool, HostListener[]>();

function locatorOf(git: string | GitLocator): GitLocator {
  return typeof git === 'string'
    ? new GitLocator(
        { kind: 'found', path: git, version: minimumGitVersion.join('.') },
        () => Promise.resolve({ kind: 'missing' }),
      )
    : git;
}

export function newView(
  log: Log,
  git: string | GitLocator,
  settings: UserSettings,
  store: Store,
  host: ShellHost & GitHost = new FakeHost(),
  timer?: Timer,
  delays = quickerRefreshDelays,
): GitTool {
  const locator = locatorOf(git);
  const view = new GitTool(
    log,
    locator,
    new GitStorage(settings, gitState(store)),
    host,
    timer,
    delays,
  );
  const hosts: HostListener[] = [];
  terminalHosts.set(view, hosts);
  const diff = diffToolOf({
    log,
    userSettings: settings,
    git: locator,
    gitTool: view,
    viewedFiles: host.viewedFiles,
  });
  diffTools.set(view, diff);
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
        () => Promise.resolve({ file: 'sh', args: [], cwd: '/', env: {} }),
        undefined,
        {
          store: toolState(store, 'terminal'),
          home: os.homedir(),
          isFolder: () => Promise.resolve(true),
          now: () => Date.now(),
          choose: () => host.chooseFolders(),
        },
      ),
      commander: new CommanderTool({
        fileSystem: () => Promise.resolve(nodeFileSystem),
        isRepository,
        codePage: () => Promise.resolve('windows-1252'),
        settings: () => settings.settings.tools.commander,
        defaultColumns: () => settings.defaults.tools.commander.columns,
        saveShowHidden: () => Promise.resolve(),
        saveColumns: () => Promise.resolve(),
        saveSorts: () => Promise.resolve(),
        saveBookmarks: () => Promise.resolve(),
        store: toolState(store, 'commander'),
        thumbnails: {
          read: () => Promise.resolve(undefined),
          has: () => Promise.resolve(false),
          full: () => Promise.resolve(false),
          write: () => Promise.resolve(),
        },
        watch: () => () => {},
        realPath: (link) => Promise.resolve(link),
        fileIcon: () => Promise.resolve(new Uint8Array()),
        platform: process.platform,
        connectTransfer: () => ({ send: () => {}, dispose: () => {} }),
        root: commanderRoot(),
      }),
      git: view,
      diff,
      viewer: new ViewerTool({
        copy: () => undefined,
        codePage: () => Promise.resolve('windows-1252'),
        fileTabSize: () => Promise.resolve(undefined),
        watch: () => () => {},
        pdfPlaces: {
          of: () => Promise.resolve(undefined),
          save: () => Promise.resolve(),
        },
        hiddenParts: () => Promise.resolve([]),
        editViewed: () => Promise.resolve(),
        closed: () => undefined,
        versionCopy: (file, rev) => view.versionCopy(file, rev),
        fileHistory: (file) => view.fileHistory(file),
        compareHistory: (page, file, rev) => diff.openHistory(page, file, rev),
      }),
      editor: new EditorTool({
        watch: () => () => {},
        codePage: () => Promise.resolve('windows-1252'),
        closesBrackets: () => false,
        viewedCopy: () => false,
        readOnlyCopy: () => false,
        copySaved: () => undefined,
        viewEdited: () => Promise.resolve(),
        compareHistory: (page, file) => diff.open(page, [file]),
      }),
    }),
  );
  return view;
}

export const commanderRootName = 'fastforward-commander-root';

export const commanderTabName = strings.tabs.sides(
  commanderRootName,
  commanderRootName,
);

export const commanderTabSides = () => {
  const root = path.join(os.tmpdir(), commanderRootName);
  return { left: root, right: root };
};

function commanderRoot(): string {
  const root = path.join(os.tmpdir(), commanderRootName);
  fs.mkdirSync(root, { recursive: true });
  return root;
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
  pathFacts: true,
  pathCommand: true,
  setTextView: true,
  setImageView: true,
  selectTab: true,
  closeTab: true,
  moveTab: true,
  moveTabToWindow: true,
  tearTab: true,
  dragTabTo: true,
  dropTab: true,
  cancelTabDrag: true,
  tabStrip: true,
  visitIndex: true,
  preloadTab: true,
  keepView: true,
  released: true,
  newTab: true,
  newWindow: true,
  closeWindow: true,
  openWith: true,
  openIn: true,
  copyText: true,
  partLooks: true,
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
  git?: string | GitLocator,
): Promise<void> {
  const view = await openView(log, tabs, opening, host, undefined, git);
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

export function attach(
  view: GitTool,
  window = '1',
): {
  page: FakePage;
  connection: Connection;
} {
  const page = new FakePage();
  const opened = shellOf(view).connect(window, (message) => {
    page.receive(message);
    if (message.type === 'release' && page.releases) {
      const { tab } = message;
      queueMicrotask(() => {
        void opened.receive({
          type: 'released',
          tab,
          view: page.views.get(tab) ?? '',
        });
      });
    }
  });
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
  const holder = holderOf(view, name);
  const original: unknown = Reflect.get(holder, name);
  assert.ok(typeof original === 'function', name);
  Reflect.set(holder, name, (...args: unknown[]) =>
    replace(
      (...inner) => {
        const result: unknown = Reflect.apply(original, holder, inner);
        return Promise.resolve(result);
      },
      ...args,
    ),
  );
}

export function holderOf(view: GitTool, name: string): object {
  if (typeof Reflect.get(view, name) === 'function') {
    return view;
  }
  const holders = Object.values(view).filter(
    (part: unknown): part is object =>
      typeof part === 'object' &&
      part !== null &&
      Object.getPrototypeOf(part) !== Object.prototype &&
      typeof Reflect.get(part, name) === 'function',
  );
  assert.strictEqual(holders.length, 1, name);
  return holders[0];
}

export function rootOf(context: unknown): string | undefined {
  return typeof context === 'object' &&
    context !== null &&
    'root' in context &&
    typeof context.root === 'string'
    ? context.root
    : undefined;
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
