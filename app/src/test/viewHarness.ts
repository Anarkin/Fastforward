import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import type { ToWebview, ToWebviewOf, Bookmark } from '../shared/protocol';
import type { Timer } from '../autoFetch';
import type { Log } from '../log';
import { activeTabKey, Storage, tabsKey } from '../storage';
import { FastforwardView, type Connection, type Host } from '../view';
import { UserSettings } from '../settings';
import { FakeStore } from './fakeStore';
import { defaultSettings } from './fixtures';
import {
  installedGit,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

export class FakePage {
  readonly messages: ToWebview[] = [];
  readonly listeners = new Set<(message: ToWebview) => void>();

  receive(message: ToWebview): void {
    this.messages.push(message);
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  last<T extends ToWebview['type']>(type: T): ToWebviewOf<T> | undefined {
    return this.messages.findLast(
      (message): message is ToWebviewOf<T> => message.type === type,
    );
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export interface OpenView {
  view: FastforwardView;
  page: FakePage;
  connection: Connection;
  store: FakeStore;
  settings: UserSettings;
}

export class FakeHost implements Host {
  folders: readonly string[] = [];
  problems: readonly string[] = [];
  readonly opened: string[] = [];

  chooseFolders(): Promise<readonly string[]> {
    return Promise.resolve(this.folders);
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
}

export async function withNotices(
  page: FakePage,
  level: 'info' | 'error',
  run: (messages: string[]) => Promise<void>,
): Promise<void> {
  const messages: string[] = [];
  const listener = (message: ToWebview) => {
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

// Each test that fetches in the background turns it on, with a fake timer
export function viewSettings(): UserSettings {
  return new UserSettings({ ...defaultSettings(), autoFetch: false });
}

// Shorter than the app's, so waiting for the watcher takes less, but long
// enough that one change still makes one refresh
const refreshDelays = { delay: 100, maxDelay: 500 };

export async function openView(
  log: Log,
  tabs: readonly string[],
  ready: boolean | 'unwatched' = true,
  host: Host = new FakeHost(),
  timer?: Timer,
): Promise<OpenView> {
  const store = new FakeStore();
  await store.update(tabsKey, tabs);
  await store.update(activeTabKey, tabs[0]);
  const settings = viewSettings();
  const view = new FastforwardView(
    log,
    await installedGit(),
    new Storage(settings, store),
    host,
    timer,
    refreshDelays,
  );
  const { page, connection } = attach(view);
  if (ready === 'unwatched') {
    stubMethod(view, 'watch', () => Promise.resolve());
  }
  if (ready) {
    await connection.receive({ type: 'ready' });
  }
  return { view, page, connection, store, settings };
}

export async function withView(
  log: Log,
  tabs: readonly string[],
  run: (view: OpenView) => Promise<void>,
  ready = true,
  host?: Host,
): Promise<void> {
  const view = await openView(log, tabs, ready, host);
  try {
    await run(view);
  } finally {
    view.connection.dispose();
    openGates();
    await view.view.idle();
  }
}

// Windows can't remove a folder git still runs in, so the suites wait for
// every view they opened before removing their repositories
const views = new Set<FastforwardView>();
const connections = new Set<Connection>();

export async function closeViews(): Promise<void> {
  for (const connection of connections) {
    connection.dispose();
  }
  connections.clear();
  openGates();
  await Promise.all([...views].map((view) => view.idle()));
  views.clear();
}

export function attach(view: FastforwardView): {
  page: FakePage;
  connection: Connection;
} {
  const page = new FakePage();
  const connection = view.connect((message) => page.receive(message));
  views.add(view);
  connections.add(connection);
  return { page, connection };
}

export function commitsSent(messages: readonly ToWebview[]): number {
  return messages.filter((message) => message.type === 'commits').length;
}

export function workingTreesSent(messages: readonly ToWebview[]): number {
  return messages.filter((message) => message.type === 'workingTree').length;
}

export function numberedLines(text: string): string {
  return Array.from({ length: 2000 }, (_, index) => `${text} ${index}\n`).join(
    '',
  );
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
  view: FastforwardView,
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
  view: FastforwardView,
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
  teardown(() => {
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

export function reopen(view: FastforwardView): {
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
  return new Storage(new UserSettings(defaultSettings()), store).bookmarksOf(
    root,
  );
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
