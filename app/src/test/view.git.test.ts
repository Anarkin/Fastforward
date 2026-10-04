import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
  workingTreeHash,
  type ToWebview,
  type ToWebviewOf,
  type Bookmark,
  type BookmarkRef,
} from '../shared/protocol';
import type { Timer } from '../autoFetch';
import { comparisonOf } from '../shared/comparisons';
import type { Log } from '../log';
import {
  activeTabKey,
  recentKey,
  sameRoot,
  soloKey,
  Storage,
  tabsKey,
} from '../storage';
import { FastforwardView, type Connection, type Host } from '../view';
import { UserSettings } from '../settings';
import { FakeStore } from './fakeStore';
import { defaultSettings, waitFor } from './fixtures';
import {
  installedGit,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';

class FakePage {
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

interface OpenView {
  view: FastforwardView;
  page: FakePage;
  connection: Connection;
  store: FakeStore;
  settings: UserSettings;
}

class FakeHost implements Host {
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

async function withNotices(
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
function viewSettings(): UserSettings {
  return new UserSettings({ ...defaultSettings(), autoFetch: false });
}

async function openView(
  log: Log,
  tabs: readonly string[],
  ready = true,
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
  );
  const { page, connection } = attach(view);
  if (ready) {
    await connection.receive({ type: 'ready' });
  }
  return { view, page, connection, store, settings };
}

async function withView(
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
  }
}

function attach(view: FastforwardView): {
  page: FakePage;
  connection: Connection;
} {
  const page = new FakePage();
  return {
    page,
    connection: view.connect((message) => page.receive(message)),
  };
}

function commitsSent(messages: readonly ToWebview[]): number {
  return messages.filter((message) => message.type === 'commits').length;
}

function workingTreesSent(messages: readonly ToWebview[]): number {
  return messages.filter((message) => message.type === 'workingTree').length;
}

function numberedLines(text: string): string {
  return Array.from({ length: 2000 }, (_, index) => `${text} ${index}\n`).join(
    '',
  );
}

function gate(): { opened: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { opened: promise, open: () => resolve() };
}

function stubMethod(
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

function reopen(view: FastforwardView): {
  page: FakePage;
  connection: Connection;
  ready: Promise<void>;
} {
  const { page, connection } = attach(view);
  return { page, connection, ready: connection.receive({ type: 'ready' }) };
}

function savedBookmarks(
  store: FakeStore,
  root: string,
): readonly Bookmark[] | undefined {
  return new Storage(new UserSettings(defaultSettings()), store).bookmarksOf(
    root,
  );
}

function fortyLines(changed: number): string {
  const lines = Array.from({ length: 40 }, (_, i) =>
    i === changed ? 'changed' : `line ${i + 1}`,
  );
  return `${lines.join('\n')}\n`;
}

suite('View', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let fixture: { a: string; b: string; f2: string; merge: string };
  let other: string;
  let otherHead: string;

  const { log } = recordingLog();

  suiteSetup(async () => {
    folder = tempFolder('view');
    repository = await tempRepository(path.join(folder, 'main'));
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
    fixture = { a, b, f2, merge };

    const second = await tempRepository(path.join(folder, 'other'));
    await second.commit('other');
    other = second.root;
    [otherHead] = await second.resolve('HEAD');
  });

  suiteTeardown(() => {
    removeFolder(folder);
  });

  async function restore(): Promise<void> {
    await repository.git('checkout', '-f', 'main');
    await repository.git('reset', '--hard', fixture.merge);
  }

  suite('of one repository', () => {
    let fastforward: FastforwardView;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    setup(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root]));
    });

    teardown(() => connection.dispose());

    test('shows the history with merges collapsed', () => {
      const commits = page.last('commits');
      assert.ok(commits);
      assert.strictEqual(commits.total, 3);
      assert.deepStrictEqual(
        commits.commits.map((commit) => commit.subject),
        ['merge feature', 'b', 'a'],
      );
      assert.strictEqual(commits.graph[0]?.merge, 'collapsed');
      assert.strictEqual(commits.graph[0]?.hidden, 2);

      const refs = page.last('repository')?.refs.map((ref) => ref.name);
      assert.deepStrictEqual(refs?.toSorted(), ['feature', 'main']);
    });

    test('starts with no commit selected the first time a tab opens, and after', async () => {
      await withView(log, [repository.root], async (view) => {
        assert.ok(view.page.last('commits'));
        assert.strictEqual(view.page.last('reveal'), undefined);
        assert.strictEqual(view.page.last('files'), undefined);
      });

      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: undefined,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files'), undefined);
      assert.strictEqual(page.last('diff'), undefined);
    });

    test('shows a tab without waiting for the state to be written', async () => {
      const written = gate();
      const state = new FakeStore();
      await state.update(tabsKey, [repository.root]);
      state.update = (key, value) => {
        state.values.set(key, value);
        return written.opened;
      };
      const view = new FastforwardView(
        log,
        await installedGit(),
        new Storage(viewSettings(), state),
        new FakeHost(),
      );
      const opened = attach(view);
      try {
        const ready = opened.connection.receive({ type: 'ready' });
        await waitFor(
          () => opened.page.last('commits') !== undefined,
          'the history',
        );
        assert.strictEqual(state.get(activeTabKey), repository.root);
        assert.deepStrictEqual(state.get(recentKey), [repository.root]);
        written.open();
        await ready;
      } finally {
        opened.connection.dispose();
      }
    });

    test('shows a tab while its watcher starts', async () => {
      const started = gate();
      const opened = await openView(log, [repository.root], false);
      stubMethod(opened.view, 'watch', async (original, ...args) => {
        await started.opened;
        return original(...args);
      });
      try {
        const ready = opened.connection.receive({ type: 'ready' });
        await waitFor(
          () => opened.page.last('commits') !== undefined,
          'the history',
        );
        started.open();
        await ready;
      } finally {
        opened.connection.dispose();
      }
    });

    test('reopens at the position of the selected commit', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      const replayed = page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.strictEqual(replayed?.selectedIndex, 1);
    });

    test('shows the last selected commit when an earlier one answers last', async () => {
      const held = gate();
      let waiting = false;
      stubMethod(fastforward, 'patchOf', async (original, ...args) => {
        if (args[1] === workingTreeHash) {
          waiting = true;
          await held.opened;
        }
        return original(...args);
      });
      const first = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await waitFor(() => waiting, 'the working tree diff');
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      held.open();
      await first;
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.strictEqual(page.last('diff')?.hash, fixture.b);
    });

    test('makes the main branch a bookmark once, then keeps the saved bookmarks', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      assert.deepStrictEqual(page.last('bookmarks')?.bookmarks, [main]);

      await connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.deepStrictEqual(savedBookmarks(store, repository.root), []);
    });

    test('refreshes once at a time, without sending an unchanged diff', async () => {
      fs.writeFileSync(path.join(repository.root, 'draft.txt'), 'draft\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('diff')?.patch.includes('+draft'));
        await connection.refresh();
        let calls = 0;
        let running = 0;
        let most = 0;
        stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
          calls++;
          running++;
          most = Math.max(most, running);
          try {
            await original(...args);
          } finally {
            running--;
          }
        });
        page.clear();
        await Promise.all([connection.refresh(), connection.refresh()]);
        assert.strictEqual(most, 1);
        assert.ok(calls >= 2);
        assert.ok(page.last('workingTree'));
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('diff'), undefined);
        assert.strictEqual(page.last('error'), undefined);
      } finally {
        fs.rmSync(path.join(repository.root, 'draft.txt'));
      }
    });

    test('sends a diff asked for again while a refresh finds it unchanged', async () => {
      fs.writeFileSync(path.join(repository.root, 'one.txt'), 'one\n');
      fs.writeFileSync(path.join(repository.root, 'two.txt'), 'two\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'one.txt',
        });
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
        const held = gate();
        let waiting = 0;
        stubMethod(fastforward, 'patchOf', async (original, ...args) => {
          if (waiting < 2) {
            waiting++;
            await held.opened;
          }
          return original(...args);
        });
        page.clear();
        const asked = Promise.all([
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'two.txt',
          }),
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'one.txt',
          }),
        ]);
        await waitFor(() => waiting === 2, 'the asked for diffs');
        await connection.refresh();
        held.open();
        await asked;
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
      } finally {
        fs.rmSync(path.join(repository.root, 'one.txt'));
        fs.rmSync(path.join(repository.root, 'two.txt'));
      }
    });

    test('lists every file of a commit and of the working tree', async () => {
      const file = path.join(repository.root, 'tree-file.txt');
      fs.writeFileSync(file, 'tree\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('tree')?.paths.includes('tree-file.txt'));
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: fixture.merge,
        });
        const tree = page.last('tree');
        assert.strictEqual(tree?.hash, fixture.merge);
        assert.ok(!tree.paths.includes('tree-file.txt'));
      } finally {
        fs.rmSync(file);
      }
    });

    test('lists the untracked files of the working tree once per refresh, for its files and its tree', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: workingTreeHash,
      });
      stubMethod(fastforward, 'sendWorkingTree', async (original, ...args) => {
        const workingTree = await original(...args);
        assert.ok(
          typeof workingTree === 'object' &&
            workingTree !== null &&
            'files' in workingTree &&
            Array.isArray(workingTree.files) &&
            'untracked' in workingTree &&
            Array.isArray(workingTree.untracked),
        );
        return {
          ...workingTree,
          untracked: [...workingTree.untracked, 'listed.txt'],
          files: [
            ...workingTree.files,
            {
              path: 'listed.txt',
              oldPath: undefined,
              status: 'U',
              insertions: 0,
              deletions: 0,
            },
          ],
        };
      });
      await connection.refresh();
      assert.deepStrictEqual(page.last('tree')?.paths, ['listed.txt']);
    });

    test('sends no tree of a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.a,
      });
      assert.strictEqual(page.last('tree'), undefined);
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.b,
      });
      assert.strictEqual(page.last('tree')?.hash, fixture.b);
    });

    test('loads pages of the history as the list asks for them', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation,
        start: 1,
      });
      const page2 = page.last('commitPage');
      assert.strictEqual(page2?.start, 1);
      assert.strictEqual(page2.generation, generation);
      assert.deepStrictEqual(
        page2.commits.map((commit) => commit.subject),
        ['b', 'a'],
      );
      assert.strictEqual(page2.graph.length, 2);

      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation: generation - 1,
        start: 1,
      });
      assert.strictEqual(page.last('commitPage'), page2);
    });

    test('answers a page of the history that fails to load with no commits, so the list asks again', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      const elsewhere = tempFolder('not-a-repository');
      try {
        stubMethod(fastforward, 'context', async (original, ...args) => {
          const context = await original(...args);
          assert.ok(typeof context === 'object' && context !== null);
          return { ...context, root: elsewhere };
        });
        page.clear();
        await connection.receive({
          type: 'loadCommits',
          root: repository.root,
          generation,
          start: 1,
        });
        const failed = page.last('commitPage');
        assert.strictEqual(failed?.start, 1);
        assert.strictEqual(failed.generation, generation);
        assert.deepStrictEqual(failed.commits, []);
        assert.ok(page.last('error'));
      } finally {
        removeFolder(elsewhere);
      }
    });

    test('expands and collapses a merge', async () => {
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('commits')?.total, 3);
    });

    test('lets the keys go on from the merge a collapse hides the selected commit in, leaving it selected', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      const commits = page.last('commits');
      assert.strictEqual(commits?.total, 3);
      assert.strictEqual(commits.selectedIndex, undefined);
      assert.strictEqual(commits.keysFrom, 0);
    });

    test('loads the files of a selected commit a collapsed merge hides once the page loads again with settings changed by hand', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      fastforward.reloadSettings();
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('forgets merges toggled by hand when the merge setting changes', async () => {
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
    });

    test('sends only the newest list when the history is worked out twice at once', async () => {
      page.clear();
      await Promise.all([
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
      ]);
      assert.strictEqual(commitsSent(page.messages), 1);
      assert.strictEqual(page.last('commits')?.total, 3);
    });

    test('expands the merge hiding a commit it jumps to', async () => {
      page.clear();
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      assert.strictEqual(page.last('reveal')?.hash, fixture.f2);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('says so when a commit picked is hidden in a collapsed merge', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.match(page.last('error')?.message ?? '', /not in the history/);
    });

    test('sends the files and diff again when the shown commit is selected again', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      assert.strictEqual(page.last('diff')?.hash, fixture.merge);
    });

    test('reports a jump to a commit outside the history', async () => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'f'.repeat(40),
      });
      assert.match(page.last('error')?.message ?? '', /is not in the history/);
    });

    test('looks up a hash typed in the address bar', async () => {
      const typed = fixture.b.slice(0, 6);
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: typed,
      });
      const lookup = page.last('hashLookup');
      assert.strictEqual(lookup?.query, typed);
      assert.deepStrictEqual(
        lookup.result.commits.map((commit) => [commit.hash, commit.subject]),
        [[fixture.b, 'b']],
      );
      assert.strictEqual(lookup.result.more, 0);
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: 'ffffff0',
      });
      assert.deepStrictEqual(page.last('hashLookup')?.result, {
        commits: [],
        more: 0,
      });
    });

    test('searches commits by text, dropping a search a newer one replaces', async () => {
      page.clear();
      await Promise.all([
        connection.receive({
          type: 'searchCommits',
          root: repository.root,
          query: 'nothing like it',
        }),
        connection.receive({
          type: 'searchCommits',
          root: repository.root,
          query: 'test',
        }),
      ]);
      const search = page.last('commitSearch');
      assert.strictEqual(search?.query, 'test');
      assert.ok(search.result.commits.length > 0);
      assert.ok(
        search.result.commits.every(({ fields }) => fields.includes('author')),
      );
      assert.strictEqual(page.last('error'), undefined);
    });

    test('drops the lookup of a hash a newer one replaced', async () => {
      const held = gate();
      let waiting = false;
      const older = fixture.b.slice(0, 4);
      const newer = fixture.b.slice(0, 5);
      stubMethod(
        fastforward,
        'commitsStartingWith',
        async (original, ...args) => {
          const found = await original(...args);
          if (args[1] === older) {
            waiting = true;
            await held.opened;
          }
          return found;
        },
      );
      const replaced = connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: older,
      });
      await waitFor(() => waiting, 'the older lookup');
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: newer,
      });
      held.open();
      await replaced;
      assert.strictEqual(page.last('hashLookup')?.query, newer);
    });

    test('drops the result of a search a newer one replaced once it was found', async () => {
      const held = gate();
      let waiting = false;
      stubMethod(fastforward, 'commitsMatching', async (original, ...args) => {
        const [context, query, signal] = args;
        if (query !== 'nothing like it') {
          return original(...args);
        }
        const found = await original(
          context,
          query,
          new AbortController().signal,
        );
        waiting = true;
        await held.opened;
        assert.ok(signal instanceof AbortSignal && signal.aborted);
        return found;
      });
      page.clear();
      const replaced = connection.receive({
        type: 'searchCommits',
        root: repository.root,
        query: 'nothing like it',
      });
      await waitFor(() => waiting, 'the replaced search');
      await connection.receive({
        type: 'searchCommits',
        root: repository.root,
        query: 'test',
      });
      held.open();
      await replaced;
      assert.strictEqual(page.last('commitSearch')?.query, 'test');
    });

    test('jumps to a commit by a short hash', async () => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.b.slice(0, 7),
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'abcdef0',
      });
      assert.match(page.last('error')?.message ?? '', /No commit abcdef0/);
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.a.slice(0, 7).toUpperCase(),
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.a);
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.b.toUpperCase(),
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
    });

    test('does not jump to a branch named like a short hash', async () => {
      await repository.git('branch', 'fade', fixture.a);
      try {
        await connection.receive({
          type: 'jump',
          root: repository.root,
          hash: 'fade',
        });
        assert.match(page.last('error')?.message ?? '', /No commit fade/);
      } finally {
        await repository.git('branch', '-D', 'fade');
      }
    });

    test('says how many commits a short hash it jumps to could be', async () => {
      const [tree] = await repository.resolve('HEAD^{tree}');
      const byPrefix = new Map<string, string>();
      let prefix: string | undefined;
      for (let n = 0; prefix === undefined; n++) {
        const content = `tree ${tree}\nauthor T <t@example.com> 0 +0000\ncommitter T <t@example.com> 0 +0000\n\nprobe ${n}\n`;
        const start = createHash('sha1')
          .update(`commit ${Buffer.byteLength(content)}\0${content}`)
          .digest('hex')
          .slice(0, 4);
        const earlier = byPrefix.get(start);
        if (earlier === undefined) {
          byPrefix.set(start, content);
          continue;
        }
        prefix = start;
        for (const [index, probe] of [earlier, content].entries()) {
          const file = path.join(folder, `probe-${index}`);
          fs.writeFileSync(file, probe);
          await repository.git('hash-object', '-t', 'commit', '-w', file);
        }
      }
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: prefix,
      });
      assert.match(
        page.last('error')?.message ?? '',
        /^\d+ commits start with /,
      );
    });

    test('goes back and forward through the commits shown', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await waitFor(
        () => page.last('navigation')?.back.length === 2,
        'the history of two steps',
      );
      assert.deepStrictEqual(
        page.last('navigation')?.back.map((entry) => entry.subject),
        ['b', 'merge feature'],
      );

      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.deepStrictEqual(
        page.last('navigation')?.forward.map((entry) => entry.hash),
        [fixture.a],
      );

      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'forward',
        steps: 2,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.a);
      assert.strictEqual(page.last('navigation')?.forward.length, 0);
    });

    test('goes back two steps clicked at once, the first to a commit a collapsed merge hides', async () => {
      for (const hash of [fixture.merge, fixture.b]) {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash,
        });
      }
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.f2,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      const back = () =>
        connection.receive({
          type: 'navigate',
          root: repository.root,
          direction: 'back',
          steps: 1,
        });
      await Promise.all([back(), back()]);
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
      const navigation = page.last('navigation');
      assert.deepStrictEqual(
        navigation?.back.map((entry) => entry.hash),
        [fixture.merge],
      );
      assert.deepStrictEqual(
        navigation?.forward.map((entry) => entry.hash).toSorted(),
        [fixture.a, fixture.f2].toSorted(),
      );
    });

    test('goes back to the working tree', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await waitFor(
        () => page.last('navigation')?.back.length === 2,
        'the history of two steps',
      );
      assert.strictEqual(
        page.last('navigation')?.back[0]?.hash,
        workingTreeHash,
      );
      page.clear();
      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.deepStrictEqual(page.last('reveal'), {
        type: 'reveal',
        hash: workingTreeHash,
        index: -1,
      });
      assert.strictEqual(page.last('files')?.hash, workingTreeHash);
      assert.strictEqual(page.last('error'), undefined);
    });

    test('adds no step for moving through the list with the arrow keys', async () => {
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
        replace: true,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
        replace: true,
      });
      assert.strictEqual(page.last('navigation'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.a);
    });

    test('leaves steps to commits that are gone out of the history', async () => {
      const gone = (
        await repository.git(
          'commit-tree',
          'main^{tree}',
          '-p',
          'main',
          '-m',
          'gone',
        )
      ).trim();
      await repository.git('update-ref', 'refs/heads/gone', gone);
      try {
        await connection.refresh();
        for (const hash of [fixture.merge, gone, fixture.b]) {
          await connection.receive({
            type: 'selectCommit',
            root: repository.root,
            hash,
          });
        }
        await waitFor(
          () => page.last('navigation')?.back.length === 2,
          'the history of two steps',
        );
      } finally {
        await repository.git('update-ref', '-d', 'refs/heads/gone');
      }
      await connection.refresh();
      assert.deepStrictEqual(
        page.last('navigation')?.back.map((entry) => entry.hash),
        [fixture.merge],
      );
      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
    });

    test('loads the history once when a change comes in while a tab first opens', async () => {
      await withView(
        log,
        [repository.root],
        async (own) => {
          await Promise.all([
            own.connection.receive({ type: 'ready' }),
            own.connection.refresh(),
          ]);
          assert.strictEqual(commitsSent(own.page.messages), 1);
          assert.strictEqual(own.page.last('reveal'), undefined);
        },
        false,
      );
    });

    test('loads the history of a tab first opened during a refresh only after it', async () => {
      await withView(
        log,
        [repository.root],
        async (own) => {
          const held = gate();
          let calls = 0;
          let running = 0;
          let most = 0;
          stubMethod(own.view, 'sendCommits', async (original, ...args) => {
            calls++;
            running++;
            most = Math.max(most, running);
            try {
              if (calls === 1) {
                await held.opened;
              }
              await original(...args);
            } finally {
              running--;
            }
          });
          const refreshing = own.connection.refresh();
          await waitFor(() => calls === 1, 'the refresh to load the history');
          const ready = own.connection.receive({ type: 'ready' });
          await waitFor(
            () => own.page.last('repository') !== undefined,
            'the tab to open',
          );
          held.open();
          await Promise.all([refreshing, ready]);
          assert.strictEqual(most, 1);
          assert.strictEqual(commitsSent(own.page.messages), 1);
          assert.strictEqual(own.page.last('reveal'), undefined);
        },
        false,
      );
    });

    test('refreshes once more for a page that asks while a refresh runs', async () => {
      await connection.refresh();
      let calls = 0;
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        calls++;
        await original(...args);
      });
      const { page: newer, connection: newerConnection } = attach(fastforward);
      try {
        page.clear();
        await Promise.all([
          connection.refresh(),
          newerConnection.refresh(),
          connection.refresh(),
        ]);
        assert.ok(calls >= 2);
        assert.strictEqual(workingTreesSent(page.messages), 2);
        assert.strictEqual(workingTreesSent(newer.messages), 1);
      } finally {
        newerConnection.dispose();
      }
    });

    test('sends the history to a page opened again while the tab first loads', async () => {
      const own = await openView(log, [repository.root], false);
      const held = gate();
      stubMethod(own.view, 'sendCommits', async (original, ...args) => {
        await held.opened;
        await original(...args);
      });
      const first = own.connection.receive({ type: 'ready' });
      await waitFor(() => own.page.last('repository') !== undefined, 'refs');
      own.connection.dispose();
      const reopened = reopen(own.view);
      try {
        await waitFor(
          () => reopened.page.last('repository') !== undefined,
          'the replayed refs',
        );
        held.open();
        await Promise.all([first, reopened.ready]);
        assert.strictEqual(reopened.page.last('commits')?.total, 3);
        assert.strictEqual(reopened.page.last('error'), undefined);
      } finally {
        reopened.connection.dispose();
      }
    });

    test('sends a history reloaded while the page was opened again', async () => {
      await connection.refresh();
      const held = gate();
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        await held.opened;
        await original(...args);
      });
      await repository.git('branch', 'while-closed', fixture.b);
      const reloading = connection.refresh();
      connection.dispose();
      const reopened = reopen(fastforward);
      try {
        await waitFor(
          () => reopened.page.last('commits') !== undefined,
          'the replayed history',
        );
        held.open();
        await Promise.all([reloading, reopened.ready]);
        assert.strictEqual(commitsSent(reopened.page.messages), 2);
      } finally {
        reopened.connection.dispose();
        await repository.git('branch', '-D', 'while-closed');
      }
    });

    test('ends the fetch on a page opened again while it ran', async () => {
      const held = gate();
      stubMethod(fastforward, 'fetchRemotes', () => held.opened);
      {
        const fetching = connection.receive({
          type: 'fetch',
          root: repository.root,
        });
        await waitFor(
          () => page.last('fetching')?.running === true,
          'the fetch to start',
        );
        connection.dispose();
        const reopened = reopen(fastforward);
        try {
          await waitFor(
            () => reopened.page.last('fetching')?.running === true,
            'the replayed fetch',
          );
          held.open();
          await Promise.all([fetching, reopened.ready]);
          assert.strictEqual(reopened.page.last('fetching')?.running, false);
        } finally {
          reopened.connection.dispose();
        }
      }
    });

    test('sends nothing to a page closed while its tab first loads', async () => {
      const own = await openView(log, [repository.root], false);
      const held = gate();
      stubMethod(own.view, 'sendCommits', async (original, ...args) => {
        await held.opened;
        await original(...args);
      });
      const first = own.connection.receive({ type: 'ready' });
      await waitFor(() => own.page.last('repository') !== undefined, 'refs');
      own.connection.dispose();
      const sent = own.page.messages.length;
      held.open();
      await first;
      assert.strictEqual(own.page.messages.length, sent);
      assert.strictEqual(own.page.last('commits'), undefined);
    });

    test('runs the refreshes asked for during one that fails', async () => {
      await connection.refresh();
      const held = gate();
      let calls = 0;
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        calls++;
        if (calls === 1) {
          await held.opened;
          throw new Error('refresh failed');
        }
        await original(...args);
      });
      const { page: newer, connection: newerConnection } = attach(fastforward);
      try {
        const failing = connection.refresh();
        const queued = newerConnection.refresh();
        held.open();
        await Promise.all([failing, queued]);
        assert.ok(newer.last('workingTree'));
        assert.match(page.last('error')?.message ?? '', /refresh failed/);
      } finally {
        newerConnection.dispose();
      }
    });

    test('applies Solo and ends a refresh while refreshes keep being asked for', async () => {
      await connection.refresh();
      let refilling = true;
      const refresh: unknown = Reflect.get(fastforward, 'refresh');
      assert.ok(typeof refresh === 'function');
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        await original(...args);
        if (refilling) {
          const queued: unknown = Reflect.apply(refresh, fastforward, [
            args[0],
          ]);
          void Promise.resolve(queued).catch(() => undefined);
        }
      });
      const looping = connection.refresh();
      try {
        page.clear();
        const solo = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(
          () => page.last('applyingSolo')?.running === false,
          'Solo to be applied',
          5000,
        );
        await solo;
        let refreshed = false;
        const refreshing = connection.refresh().then(() => {
          refreshed = true;
        });
        await waitFor(() => refreshed, 'the refresh to end', 5000);
        await refreshing;
      } finally {
        refilling = false;
        await looping;
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
      }
    });

    test('reads the working tree once at a time while a tab first loads', async () => {
      const own = await openView(log, [repository.root], false);
      const held = gate();
      let calls = 0;
      let running = 0;
      let most = 0;
      let loaded = false;
      stubMethod(own.view, 'sendWorkingTree', async (original, ...args) => {
        calls++;
        running++;
        most = Math.max(most, running);
        try {
          if (calls === 1) {
            await held.opened;
          }
          return await original(...args);
        } finally {
          running--;
        }
      });
      stubMethod(own.view, 'sendCommit', async (original, ...args) => {
        await original(...args);
        loaded = true;
      });
      try {
        const first = own.connection.receive({ type: 'ready' });
        await waitFor(() => calls === 1, 'the working tree to be read');
        const again = own.connection.refresh();
        await waitFor(() => loaded, 'the history to load');
        await Promise.race([
          again,
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
        held.open();
        await Promise.all([first, again]);
        assert.strictEqual(most, 1);
        assert.ok(calls >= 2);
      } finally {
        own.connection.dispose();
      }
    });

    test('takes only hashes of the history from the page', async () => {
      const written = path.join(folder, 'written.txt');
      const hash = `--output=${written}`;
      for (const message of [
        {
          type: 'loadFileDiff',
          root: repository.root,
          hash,
          path: 'a',
          diff: 1,
        },
        { type: 'selectFile', root: repository.root, hash, path: 'a' },
        { type: 'loadTree', root: repository.root, hash },
      ] as const) {
        page.clear();
        await connection.receive(message);
        assert.match(page.last('error')?.message ?? '', /not in the history/);
      }
      assert.ok(!fs.existsSync(written));
    });

    test('ignores a file picked on a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'selectFile',
        root: repository.root,
        hash: fixture.a,
        path: 'a',
      });
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('fileContent'), undefined);
      assert.strictEqual(page.last('diff')?.path, undefined);
    });

    test('drops the diff of a file of a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      const held = gate();
      let calls = 0;
      stubMethod(fastforward, 'patchOf', async (original, ...args) => {
        calls += 1;
        if (calls === 1) {
          await held.opened;
        }
        return original(...args);
      });
      page.clear();
      const loading = connection.receive({
        type: 'loadFileDiff',
        root: repository.root,
        hash: fixture.b,
        path: 'b.txt',
        diff: 1,
      });
      await waitFor(() => calls === 1, 'the file diff');
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      held.open();
      await loading;
      assert.strictEqual(page.last('fileDiff'), undefined);
    });

    test('stops reading the files and diff of a commit selected before another', async () => {
      for (const name of ['commitFiles', 'patchOf']) {
        const held = gate();
        const signals: AbortSignal[] = [];
        stubMethod(fastforward, name, async (original, ...args) => {
          const signal = args.at(-1);
          assert.ok(signal instanceof AbortSignal);
          if (args[1] === fixture.a) {
            signals.push(signal);
            await held.opened;
          }
          return original(...args);
        });
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        const first = connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.a,
        });
        await waitFor(() => signals.length === 1, `the first ${name}`);
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.b,
        });
        assert.ok(signals[0]?.aborted, name);
        held.open();
        await first;
        assert.strictEqual(page.last('error'), undefined, name);
        assert.strictEqual(page.last('files')?.hash, fixture.b, name);
        assert.strictEqual(page.last('diff')?.hash, fixture.b, name);
        assert.ok(
          page.messages.every(
            (message) => message.type !== 'diff' || message.hash !== fixture.a,
          ),
          name,
        );
      }
    });

    test('shows a selected uncommitted file deleted since, without failing the refresh', async () => {
      const added = path.join(repository.root, 'added.txt');
      fs.writeFileSync(added, 'added\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'added.txt',
        });
        fs.rmSync(added);
        page.clear();
        await connection.refresh();
        assert.strictEqual(page.last('error'), undefined);
        assert.strictEqual(page.last('fileContent')?.content, '');
      } finally {
        fs.rmSync(added, { force: true });
      }
    });

    test('sends the texts a diff asks for, an uncommitted new side read from disk', async () => {
      const file = path.join(repository.root, 'texts.ts');
      fs.writeFileSync(file, 'old\n');
      try {
        const [blob] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        fs.writeFileSync(file, 'new\n');
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 3,
          texts: [
            { path: 'texts.ts', side: 'old', blob },
            { path: 'texts.ts', side: 'new', blob },
            { path: 'texts.ts', side: 'old', blob: '0'.repeat(39) + '1' },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', 'old\n'],
            ['new', 'new\n'],
            ['old', undefined],
          ],
        );
        assert.strictEqual(page.last('texts')?.diff, 3);
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('applies the merge setting to the history shown, without reloading it', async () => {
      await connection.refresh();
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded');
    });

    test('shows only the history of the checked-out commit when solo, and every branch again after', async () => {
      await connection.refresh();
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      await repository.git('branch', 'side', side);
      try {
        await connection.refresh();
        assert.strictEqual(page.last('commits')?.total, 4);
        page.clear();
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        assert.strictEqual(page.last('commits')?.total, 3);
        const applying = page.messages.flatMap((message) =>
          message.type === 'applyingSolo' ? [message.running] : [],
        );
        assert.deepStrictEqual(applying, [true, false]);
        assert.ok(
          page.messages.findIndex((message) => message.type === 'commits') <
            page.messages.findLastIndex(
              (message) => message.type === 'applyingSolo',
            ),
        );
        assert.deepStrictEqual(store.get(soloKey), { [repository.root]: true });
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.total, 4);
      } finally {
        await store.update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });

    test('saves the layout and sends it when the page loads', async () => {
      await connection.receive({
        type: 'setColumnWidths',
        widths: [400, 250],
      });
      await connection.receive({ type: 'setShowAllFiles', show: true });
      await connection.receive({ type: 'ready' });
      const layout = page.last('layout');
      assert.deepStrictEqual(layout?.columnWidths, [400, 250]);
      assert.strictEqual(layout.showAllFiles, true);
    });

    test('keeps a folder spelled two ways as one tab', async function () {
      if (process.platform !== 'win32') {
        this.skip();
      }
      const respelled = repository.root.replace(/^[a-z]/i, (drive) =>
        drive === drive.toUpperCase()
          ? drive.toLowerCase()
          : drive.toUpperCase(),
      );
      await withView(log, [repository.root, respelled], async (view) => {
        const roots = view.page.last('tabs')?.tabs.map((tab) => tab.root) ?? [];
        assert.deepStrictEqual(
          roots.filter(
            (root) => root.toLowerCase() === respelled.toLowerCase(),
          ),
          [repository.root],
        );
      });
    });

    test('shows what git said when a request fails', async () => {
      stubMethod(fastforward, 'sendTree', () =>
        Promise.reject(
          Object.assign(new Error('Failed to execute git'), {
            stderr: 'fatal: bad tree\n',
          }),
        ),
      );
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('error')?.message, 'fatal: bad tree');
    });

    test('reports what git said when it refuses a checkout', async () => {
      await withNotices(page, 'error', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'no-such-branch' },
        });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0], /^Couldn't check out no-such-branch/);
        assert.match(messages[0], /invalid reference: no-such-branch/);
        assert.doesNotMatch(messages[0], /Failed to execute git/);
      });
    });

    test('reloads when a branch is created', async () => {
      await connection.refresh();
      page.clear();
      await repository.git('branch', 'created', 'main~1');
      try {
        await connection.refresh();
        const refs = page.last('repository')?.refs.map((ref) => ref.name);
        assert.ok(refs?.includes('created'));
      } finally {
        await repository.git('branch', '-D', 'created');
      }
    });

    test('lists the history again only for refs that change its commits, whatever solo leaves out', async () => {
      await connection.refresh();
      let listed = 0;
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      const refreshed = async () => {
        page.clear();
        await connection.refresh();
        return page.last('commits');
      };
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      try {
        await repository.git('tag', 'kept', fixture.a);
        const tagged = await refreshed();
        assert.ok(
          page.last('repository')?.refs.some((ref) => ref.name === 'kept'),
        );
        assert.deepStrictEqual(
          tagged?.decorations.find(([index]) => index === 2),
          [2, 1],
        );
        await repository.git('checkout', '--detach', fixture.f2);
        assert.ok(((await refreshed())?.total ?? 0) > 3);
        await repository.git('checkout', 'main');
        await repository.git('tag', '-d', 'kept');
        assert.strictEqual((await refreshed())?.total, 3);
        assert.strictEqual(listed, 0);
        await repository.git('branch', 'side', side);
        assert.strictEqual((await refreshed())?.total, 4);
        assert.strictEqual(listed, 1);
        await repository.git('branch', '-D', 'side');
        assert.strictEqual((await refreshed())?.total, 3);
        assert.strictEqual(listed, 2);
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        listed = 0;
        await repository.git('update-ref', 'refs/remotes/origin/side', side);
        assert.strictEqual((await refreshed())?.total, 3);
        assert.strictEqual(listed, 0);
      } finally {
        await store.update(soloKey, {});
        await repository.git('update-ref', '-d', 'refs/remotes/origin/side');
        await restore();
      }
    });

    test('sends the history again on the next refresh after it failed to load', async () => {
      await connection.refresh();
      const before = page.last('commits')?.generation ?? -1;
      let failed = false;
      const elsewhere = tempFolder('not-a-repository');
      stubMethod(fastforward, 'sendShownHistory', (original, ...args) => {
        const [context, ...rest] = args;
        if (failed || typeof context !== 'object') {
          return original(...args);
        }
        failed = true;
        return original({ ...context, root: elsewhere }, ...rest);
      });
      await repository.git('branch', 'failed-once', 'main~1');
      try {
        await connection.refresh();
        assert.ok(failed);
        await connection.refresh();
        assert.ok((page.last('commits')?.generation ?? -1) > before);
      } finally {
        await repository.git('branch', '-D', 'failed-once');
        removeFolder(elsewhere);
      }
    });

    test('reloads when a ref moves, keeping the top commit in place', async () => {
      await connection.refresh();
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });

      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded unchanged');

      try {
        await repository.commit('c');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.total, 4);
        assert.deepStrictEqual(commits.scrollTarget, { index: 2, offset: 7 });
        assert.ok(page.last('repository'));
      } finally {
        await restore();
      }
    });

    test('stays at the top of the list when new commits come in', async () => {
      await connection.refresh();
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: workingTreeHash,
        offset: 0,
      });
      page.clear();
      try {
        await repository.commit('on top');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.commits[0]?.subject, 'on top');
        assert.deepStrictEqual(commits.scrollTarget, { index: -1, offset: 0 });
      } finally {
        await restore();
      }
    });

    test('lets go of the selected commit once it is gone from the history', async () => {
      await repository.commit('doomed', { 'doomed.txt': 'doomed\n' });
      const [doomed] = await repository.resolve('HEAD');
      try {
        await connection.refresh();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: doomed,
        });
        assert.strictEqual(page.last('files')?.hash, doomed);
        page.clear();
        await repository.git('reset', '--hard', 'HEAD~1');
        await connection.refresh();
        assert.ok(page.last('unselect'));
        page.clear();
        await connection.receive({ type: 'ready' });
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('commits')?.selectedIndex, undefined);
      } finally {
        await restore();
      }
    });

    test('shows a detached HEAD as a bubble on its commit', async () => {
      await repository.git('checkout', '--detach', fixture.b);
      try {
        page.clear();
        await connection.refresh();
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.b);
        assert.deepStrictEqual(
          page.last('commits')?.decorations.find(([index]) => index === 1),
          [1, 1],
        );
      } finally {
        await restore();
      }
    });

    test('checks out a tag, not a branch of the same name', async () => {
      await repository.git('tag', 'same', fixture.a);
      await repository.git('branch', 'same', 'main');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'tag', name: 'same' },
        });
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.a);
      } finally {
        await restore();
        await repository.git('tag', '-d', 'same');
        await repository.git('branch', '-D', 'same');
      }
    });

    test('checks out a branch and a commit', async () => {
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'feature' },
        });
        assert.strictEqual(page.last('repository')?.head, 'feature');
        assert.strictEqual(page.last('reveal')?.hash, fixture.f2);

        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'commit', hash: fixture.a },
        });
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.a);
      } finally {
        await restore();
      }
    });

    test('checks out a remote branch as a new branch that tracks it', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('update-ref', 'refs/remotes/origin/topic', 'main~1');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/topic' },
        });
        assert.strictEqual(page.last('repository')?.head, 'topic');
        assert.strictEqual(
          (
            await repository.git(
              'rev-parse',
              '--abbrev-ref',
              'topic@{upstream}',
            )
          ).trim(),
          'origin/topic',
        );
      } finally {
        await restore();
        await repository.git('branch', '-D', 'topic');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('checks out a remote branch of a remote with a slash in its name as a branch of the same name', async () => {
      await repository.git('remote', 'add', 'team/fork', repository.root);
      await repository.git(
        'update-ref',
        'refs/remotes/team/fork/forked',
        'main~1',
      );
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'team/fork/forked' },
        });
        assert.strictEqual(page.last('repository')?.head, 'forked');
      } finally {
        await restore();
        await repository.git('branch', '-D', 'forked').catch(() => '');
        await repository.git('remote', 'remove', 'team/fork');
      }
    });

    test('checks out a remote branch as a new branch, even with a tag of its name', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('update-ref', 'refs/remotes/origin/clash', 'main~1');
      await repository.git('tag', 'origin/clash', fixture.a);
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/clash' },
        });
        assert.strictEqual(page.last('repository')?.head, 'clash');
        assert.deepStrictEqual(await repository.resolve('clash'), [fixture.b]);
      } finally {
        await restore();
        await repository.git('branch', '-D', 'clash').catch(() => '');
        await repository.git('tag', '-d', 'origin/clash');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('fast-forwards the local branch of a remote branch that is ahead', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('branch', 'behind', 'main~1');
      await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/behind' },
        });
        assert.strictEqual(page.last('repository')?.head, 'behind');
        assert.deepStrictEqual(await repository.resolve('behind'), [
          fixture.merge,
        ]);
      } finally {
        await restore();
        await repository.git('branch', '-D', 'behind');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test("says when it can't fast-forward the local branch of a remote branch", async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('checkout', '-b', 'blocked', 'main~1');
      const clash = path.join(repository.root, 'clash');
      try {
        await repository.commit('adds clash', { clash: 'theirs' });
        await repository.git(
          'update-ref',
          'refs/remotes/origin/blocked',
          'HEAD',
        );
        await repository.git('reset', '--hard', 'main~1');
        await repository.git('checkout', 'main');
        fs.writeFileSync(clash, 'mine');
        await connection.refresh();
        await withNotices(page, 'error', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'remote', name: 'origin/blocked' },
          });
          await waitFor(
            () => page.last('repository')?.head === 'blocked',
            'the checked-out branch',
          );
          assert.strictEqual(messages.length, 1);
          assert.match(
            messages[0],
            /couldn't fast-forward it to origin\/blocked/,
          );
        });
        assert.deepStrictEqual(
          await repository.resolve('blocked'),
          await repository.resolve('main~1'),
        );
      } finally {
        fs.rmSync(clash, { force: true });
        await restore();
        await repository.git('branch', '-D', 'blocked');
        await repository.git('update-ref', '-d', 'refs/remotes/origin/blocked');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('says nothing when the local branch of a remote branch is up to date', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('branch', 'even', 'main');
      await repository.git('update-ref', 'refs/remotes/origin/even', 'main');
      try {
        await withNotices(page, 'error', async (errors) => {
          await withNotices(page, 'info', async (infos) => {
            await connection.receive({
              type: 'checkout',
              root: repository.root,
              target: { kind: 'remote', name: 'origin/even' },
            });
            await waitFor(
              () => page.last('repository')?.head === 'even',
              'the checked-out branch',
            );
            assert.deepStrictEqual([...errors, ...infos], []);
          });
        });
      } finally {
        await restore();
        await repository.git('branch', '-D', 'even');
        await repository.git('update-ref', '-d', 'refs/remotes/origin/even');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('says when a remote branch has diverged from its local one', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('checkout', '-b', 'apart', 'main~1');
      try {
        await repository.commit('apart only');
        await repository.git('checkout', 'main');
        await repository.git('update-ref', 'refs/remotes/origin/apart', 'main');
        await connection.refresh();
        await withNotices(page, 'info', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'remote', name: 'origin/apart' },
          });
          await waitFor(
            () => page.last('repository')?.head === 'apart',
            'the checked-out branch',
          );
          assert.strictEqual(messages.length, 1);
          assert.match(
            messages[0],
            /apart, which has diverged from origin\/apart/,
          );
        });
      } finally {
        await restore();
        await repository.git('branch', '-D', 'apart');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('says which commits a checkout leaves behind on no branch or tag, and nothing when none', async () => {
      await repository.git('checkout', '--detach', fixture.a);
      await repository.commit('stray one');
      await repository.commit('stray two');
      const [two, one] = await repository.resolve('HEAD', 'HEAD~1');
      try {
        await connection.refresh();
        await withNotices(page, 'info', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'branch', name: 'main' },
          });
          assert.deepStrictEqual(messages, [
            `Left 2 commits behind on no branch or tag: ${two.slice(0, 7)} ${one.slice(0, 7)}`,
          ]);
        });
        await withNotices(page, 'info', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'commit', hash: fixture.b },
          });
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'branch', name: 'main' },
          });
          assert.deepStrictEqual(messages, []);
        });
      } finally {
        await restore();
      }
    });

    test('names only the newest few commits a checkout leaves behind', async () => {
      await repository.git('checkout', '--detach', fixture.a);
      for (const stray of ['1', '2', '3', '4', '5', '6']) {
        await repository.commit(stray);
      }
      const newest = await repository.resolve(
        'HEAD',
        'HEAD~1',
        'HEAD~2',
        'HEAD~3',
        'HEAD~4',
      );
      try {
        await connection.refresh();
        await withNotices(page, 'info', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'branch', name: 'main' },
          });
          assert.deepStrictEqual(messages, [
            `Left 6 commits behind on no branch or tag: ${newest.map((hash) => hash.slice(0, 7)).join(' ')} and 1 more`,
          ]);
        });
      } finally {
        await restore();
      }
    });

    test('refuses to check out anything while a rebase is paused', async () => {
      await repository.git('checkout', '-b', 'onto', fixture.a);
      await repository.commit('onto');
      await repository.git('checkout', '-b', 'paused', fixture.a);
      await repository.commit('paused');
      await assert.rejects(repository.git('rebase', '--exec', 'false', 'onto'));
      const [stopped] = await repository.resolve('HEAD');
      try {
        await connection.refresh();
        await withNotices(page, 'error', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'branch', name: 'feature' },
          });
          assert.strictEqual(messages.length, 1);
          assert.match(messages[0], /^Couldn't check out feature/);
        });
        assert.deepStrictEqual(await repository.resolve('HEAD'), [stopped]);
      } finally {
        await repository.git('rebase', '--abort').catch(() => undefined);
        await restore();
        await repository.git('branch', '-D', 'onto', 'paused');
      }
    });
  });

  suite('with two tabs', () => {
    let tabs: OpenView;

    setup(async () => {
      tabs = await openView(log, [repository.root, other]);
      await tabs.connection.refresh();
    });

    teardown(() => tabs.connection.dispose());

    test('comes back to a tab as it was, without reloading its history', async () => {
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.deepStrictEqual(tabs.page.last('commits')?.scrollTarget, {
        index: 1,
        offset: 7,
      });
      assert.ok(tabs.page.last('workingTree'));
    });

    test('reloads the history of a tab whose refs moved while away', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await repository.git('branch', 'moved-away', 'main~1');
      try {
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        assert.strictEqual(commitsSent(tabs.page.messages), 2);
        const refs = tabs.page.last('repository')?.refs.map((ref) => ref.name);
        assert.ok(refs?.includes('moved-away'));
      } finally {
        await repository.git('branch', '-D', 'moved-away');
      }
    });

    test('reloads other tabs for a changed merge setting when they come back', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'setCollapseMerges',
        collapse: false,
      });
      assert.strictEqual(tabs.settings.settings.collapseMerges, false);
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.strictEqual(tabs.page.last('commits')?.total, 5);
    });

    test('spins the solo button only on the repository applying it, also when left and come back to', async () => {
      const held = gate();
      let holding = true;
      stubMethod(tabs.view, 'sendCommits', async (original, ...args) => {
        if (holding) {
          holding = false;
          await held.opened;
        }
        await original(...args);
      });
      const spinning = () => tabs.page.last('applyingSolo')?.running;
      try {
        const applying = tabs.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(() => spinning() === true, 'the solo button to spin');

        tabs.page.clear();
        await tabs.connection.receive({ type: 'selectTab', root: other });
        assert.strictEqual(tabs.page.last('tabs')?.active, other);
        assert.notStrictEqual(spinning(), true);

        tabs.page.clear();
        const back = tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        await waitFor(() => spinning() === true, 'the spin shown again');

        held.open();
        await Promise.all([applying, back]);
        assert.strictEqual(spinning(), false);
      } finally {
        held.open();
        await tabs.store.update(soloKey, {});
      }
    });

    test('stops the solo spin of a repository left while applying it', async () => {
      const held = gate();
      let holding = true;
      stubMethod(tabs.view, 'sendCommits', async (original, ...args) => {
        if (holding) {
          holding = false;
          await held.opened;
        }
        await original(...args);
      });
      try {
        const applying = tabs.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(
          () => tabs.page.last('applyingSolo')?.running === true,
          'the solo button to spin',
        );
        await tabs.connection.receive({ type: 'selectTab', root: other });
        tabs.page.clear();
        held.open();
        await applying;
        assert.strictEqual(tabs.page.last('applyingSolo'), undefined);
        await tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        assert.strictEqual(tabs.page.last('applyingSolo')?.running, false);
      } finally {
        held.open();
        await tabs.store.update(soloKey, {});
      }
    });

    test('keeps solo to the repository it was turned on for', async () => {
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      await repository.git('branch', 'side', side);
      try {
        await tabs.connection.refresh();
        assert.strictEqual(tabs.page.last('commits')?.total, 4);
        await tabs.connection.receive({ type: 'selectTab', root: other });
        await tabs.connection.receive({
          type: 'setSolo',
          root: other,
          solo: true,
        });
        assert.strictEqual(tabs.page.last('solo')?.solo, true);
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        assert.strictEqual(tabs.page.last('solo')?.solo, false);
        assert.strictEqual(tabs.page.last('commits')?.total, 4);
        await tabs.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        assert.strictEqual(tabs.page.last('commits')?.total, 3);
        tabs.page.clear();
        await tabs.connection.receive({ type: 'selectTab', root: other });
        assert.strictEqual(tabs.page.last('solo')?.solo, true);
      } finally {
        await tabs.store.update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });

    test('preloads a tab in the background, which then opens as it was left', async () => {
      tabs.page.clear();
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      assert.ok(
        !tabs.page.messages.some(
          (message) =>
            (message.type === 'files' && message.hash === otherHead) ||
            (message.type === 'commits' && message.total === 1),
        ),
      );
      tabs.page.clear();
      await tabs.connection.receive({ type: 'selectTab', root: other });
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
    });

    test('opens a tab whose preload failed with its history', async () => {
      let failed = false;
      stubMethod(tabs.view, 'sendWorkingTree', async (original, ...args) => {
        const [context] = args;
        if (
          !failed &&
          typeof context === 'object' &&
          context !== null &&
          'root' in context &&
          context.root === other
        ) {
          failed = true;
          throw new Error('working tree failed');
        }
        await original(...args);
      });
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      assert.ok(failed);
      tabs.page.clear();
      await tabs.connection.receive({ type: 'selectTab', root: other });
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      assert.strictEqual(tabs.page.last('files'), undefined);
    });

    test("shows no error of a tab's request that failed after it was left", async () => {
      const held = gate();
      stubMethod(tabs.view, 'sendTree', async () => {
        await held.opened;
        throw new Error('tree failed');
      });
      const loading = tabs.connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.merge,
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      tabs.page.clear();
      held.open();
      await loading;
      assert.strictEqual(tabs.page.last('error'), undefined);
    });

    test('preloads nothing for the shown tab, or one opened before', async () => {
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'preloadTab',
        root: repository.root,
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      tabs.page.clear();
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      assert.strictEqual(commitsSent(tabs.page.messages), 0);
      assert.strictEqual(tabs.page.last('files'), undefined);
    });

    test('opens a tab that is preloading once it has loaded, without sending its history again', async () => {
      tabs.page.clear();
      await Promise.all([
        tabs.connection.receive({ type: 'preloadTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: other }),
      ]);
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      assert.strictEqual(tabs.page.last('error'), undefined);
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
    });

    test('shows nothing of a preloading tab once another tab is clicked', async () => {
      tabs.page.clear();
      await Promise.all([
        tabs.connection.receive({ type: 'preloadTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: repository.root }),
      ]);
      assert.strictEqual(tabs.page.last('tabs')?.active, repository.root);
      assert.ok(
        !tabs.page.messages.some(
          (message) => message.type === 'commits' && message.total === 1,
        ),
      );
    });

    test('drops what the page asks of a tab it has left, but keeps its bookmarks and place', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await tabs.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('navigation'), undefined);
      assert.deepStrictEqual(savedBookmarks(tabs.store, repository.root), []);
      assert.deepStrictEqual(savedBookmarks(tabs.store, other), [
        { kind: 'branch', name: 'main' },
      ]);

      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      const replayed = tabs.page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.deepStrictEqual(replayed?.scrollTarget, { index: 1, offset: 7 });
      assert.notStrictEqual(tabs.page.last('files')?.hash, fixture.b);
    });

    test('keeps edited bookmarks when a tab opens again', async () => {
      await tabs.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, []);
      await tabs.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, []);
    });

    test('shows the error of opening the next tab after one is closed', async () => {
      stubMethod(tabs.view, 'loadTab', () =>
        Promise.reject(new Error('next tab failed')),
      );
      await tabs.connection.receive({
        type: 'closeTab',
        root: repository.root,
      });
      assert.strictEqual(tabs.page.last('tabs')?.active, other);
      assert.match(tabs.page.last('error')?.message ?? '', /next tab failed/);
    });

    test('keeps the shown tab when another one closes', async () => {
      await tabs.connection.receive({ type: 'closeTab', root: other });
      const left = tabs.page.last('tabs');
      assert.strictEqual(left?.active, repository.root);
      assert.ok(!left.tabs.some((tab) => sameRoot(tab.root, other)));
    });

    test('opens the tab before the shown one when that closes last in the list', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({ type: 'closeTab', root: other });
      assert.strictEqual(tabs.page.last('tabs')?.active, repository.root);
    });

    test('sorts tabs by name and closes one, opening the next', async () => {
      const zeta = await tempRepository(path.join(folder, 'Zeta'));
      await zeta.commit('zeta');
      await withView(log, [other, zeta.root, repository.root], async (own) => {
        const names = () =>
          (own.page.last('tabs')?.tabs ?? []).map((tab) => tab.name);
        await own.connection.receive({ type: 'sortTabs' });
        assert.deepStrictEqual(names(), ['main', 'other', 'Zeta']);
        await own.connection.receive({ type: 'closeTab', root: other });
        const left = own.page.last('tabs');
        assert.deepStrictEqual(names(), ['main', 'Zeta']);
        assert.strictEqual(left?.active, zeta.root);
      });
    });

    test('sends nothing of a tab closed while it loads to the tab opened again for its repository', async () => {
      const held = gate();
      let holding = true;
      stubMethod(tabs.view, 'sendCommits', async (original, ...args) => {
        if (holding) {
          holding = false;
          await held.opened;
        }
        await original(...args);
      });
      try {
        const applying = tabs.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(
          () => tabs.page.last('applyingSolo')?.running === true,
          'the solo button to spin',
        );
        await tabs.connection.receive({
          type: 'closeTab',
          root: repository.root,
        });
        await tabs.connection.receive({
          type: 'openRepository',
          root: repository.root,
        });
        assert.ok(tabs.page.last('commits'));
        tabs.page.clear();
        held.open();
        await applying;
        assert.strictEqual(commitsSent(tabs.page.messages), 0);
      } finally {
        held.open();
        await tabs.store.update(soloKey, {});
      }
    });

    test('fetches a repository once at a time, also when its tab is closed and opened again while it fetches', async () => {
      let requests = 0;
      let released = false;
      const waiting: (() => void)[] = [];
      const server = createServer((_request, response) => {
        requests += 1;
        const answer = () => {
          response.writeHead(404);
          response.end();
        };
        if (released) {
          answer();
        } else {
          waiting.push(answer);
        }
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      assert.ok(typeof address === 'object' && address !== null);
      const slow = await tempRepository(path.join(folder, 'slow-remote'));
      await slow.commit('a');
      await slow.git(
        'remote',
        'add',
        'origin',
        `http://127.0.0.1:${address.port}/x`,
      );
      try {
        await withView(log, [slow.root, other], async (own) => {
          const first = own.connection.receive({
            type: 'fetch',
            root: slow.root,
          });
          await waitFor(() => requests === 1, 'the fetch to reach the remote');
          await own.connection.receive({ type: 'closeTab', root: slow.root });
          await own.connection.receive({
            type: 'openRepository',
            root: slow.root,
          });
          const second = own.connection.receive({
            type: 'fetch',
            root: slow.root,
          });
          released = true;
          for (const answer of waiting) {
            answer();
          }
          await Promise.all([first, second]);
          assert.strictEqual(requests, 1);
        });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  suite('of other repositories', () => {
    test('shows a file entire until it is left, or always when pinned', async () => {
      const long = await tempRepository(path.join(folder, 'long'));
      await long.commit('first', {
        'a.txt': fortyLines(-1),
        'b.txt': fortyLines(-1),
      });
      await long.commit('second', {
        'a.txt': fortyLines(19),
        'b.txt': fortyLines(19),
      });
      const [second] = await long.resolve('HEAD');
      await withView(log, [long.root, other], async (view) => {
        const select = (file: string | undefined) =>
          view.connection.receive({
            type: 'selectFile',
            root: long.root,
            hash: second,
            path: file,
          });
        const entire = () =>
          /^ line 1$/m.test(view.page.last('diff')?.patch ?? '');
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        await view.connection.receive({
          type: 'selectCommit',
          root: long.root,
          hash: second,
        });
        await select('a.txt');
        assert.strictEqual(entire(), false);
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: true,
        });
        assert.strictEqual(entire(), true);
        await select('b.txt');
        assert.strictEqual(entire(), false);
        await select('a.txt');
        assert.strictEqual(entire(), false);

        await view.connection.receive({ type: 'pinEntireFile', pinned: true });
        assert.strictEqual(entire(), true);
        await select('b.txt');
        assert.strictEqual(entire(), true);
        assert.strictEqual(view.settings.settings.entireFilePinned, true);
        await view.connection.receive({ type: 'ready' });
        assert.strictEqual(view.page.last('layout')?.entireFilePinned, true);
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        assert.strictEqual(entire(), false);

        await select('a.txt');
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: true,
        });
        await view.connection.receive({ type: 'selectTab', root: other });
        await view.connection.receive({ type: 'selectTab', root: long.root });
        assert.strictEqual(entire(), false);
      });
    });

    test('keeps a file entire when another tab is closed', async () => {
      const long = await tempRepository(path.join(folder, 'long-kept'));
      await long.commit('first', { 'a.txt': fortyLines(-1) });
      await long.commit('second', { 'a.txt': fortyLines(19) });
      const [second] = await long.resolve('HEAD');
      await withView(log, [other, long.root], async (view) => {
        const entire = () =>
          /^ line 1$/m.test(view.page.last('diff')?.patch ?? '');
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        await view.connection.receive({ type: 'selectTab', root: long.root });
        await view.connection.receive({
          type: 'selectCommit',
          root: long.root,
          hash: second,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: long.root,
          hash: second,
          path: 'a.txt',
        });
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: true,
        });
        assert.strictEqual(entire(), true);
        await view.connection.receive({ type: 'closeTab', root: other });
        assert.strictEqual(view.page.last('tabs')?.active, long.root);
        assert.strictEqual(entire(), true);
      });
    });

    test('keeps a tab as it is when it is clicked while active', async () => {
      const long = await tempRepository(path.join(folder, 'long-clicked'));
      await long.commit('first', { 'a.txt': fortyLines(-1) });
      await long.commit('second', { 'a.txt': fortyLines(19) });
      const [second] = await long.resolve('HEAD');
      await withView(log, [long.root, other], async (view) => {
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        await view.connection.receive({
          type: 'selectCommit',
          root: long.root,
          hash: second,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: long.root,
          hash: second,
          path: 'a.txt',
        });
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: true,
        });
        view.page.clear();
        await view.connection.receive({ type: 'selectTab', root: long.root });
        assert.strictEqual(view.page.last('commits'), undefined);
        assert.strictEqual(view.page.last('diff'), undefined);
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: false,
        });
        assert.doesNotMatch(view.page.last('diff')?.patch ?? '', /^ line 1$/m);
      });
    });

    test('shows the diff of the last entire file choice when an earlier one answers last', async () => {
      const long = await tempRepository(path.join(folder, 'long-raced'));
      await long.commit('first', { 'a.txt': fortyLines(-1) });
      await long.commit('second', { 'a.txt': fortyLines(19) });
      const [second] = await long.resolve('HEAD');
      await withView(log, [long.root], async (view) => {
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        await view.connection.receive({
          type: 'selectCommit',
          root: long.root,
          hash: second,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: long.root,
          hash: second,
          path: 'a.txt',
        });
        const held = gate();
        let waiting = false;
        stubMethod(view.view, 'patchOf', async (original, ...args) => {
          const [, , scope] = args;
          if (
            typeof scope === 'object' &&
            scope !== null &&
            'entireFile' in scope &&
            scope.entireFile === true
          ) {
            waiting = true;
            await held.opened;
          }
          return original(...args);
        });
        const shown = view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: true,
        });
        await waitFor(() => waiting, 'the entire file');
        await view.connection.receive({
          type: 'showEntireFile',
          root: long.root,
          entire: false,
        });
        held.open();
        await shown;
        assert.doesNotMatch(view.page.last('diff')?.patch ?? '', /^ line 1$/m);
      });
    });

    test('ignores whitespace by default, and shows changes to it once asked, remembering that', async () => {
      const spaced = await tempRepository(path.join(folder, 'spaced'));
      await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
      await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
      const [indent] = await spaced.resolve('HEAD');
      await withView(log, [spaced.root], async (view) => {
        const changed = () =>
          /^[-+] {0,2}one$/m.test(view.page.last('diff')?.patch ?? '');
        assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, true);
        await view.connection.receive({
          type: 'selectCommit',
          root: spaced.root,
          hash: indent,
        });
        assert.strictEqual(changed(), false);
        await view.connection.receive({
          type: 'setIgnoreWhitespace',
          ignore: false,
        });
        assert.strictEqual(changed(), true);
        assert.strictEqual(view.settings.settings.ignoreWhitespace, false);
        await view.connection.receive({ type: 'ready' });
        assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
      });
    });

    test('wraps no long lines by default, and wraps them once asked, remembering that', async () => {
      await withView(log, [other], async (view) => {
        assert.strictEqual(view.page.last('layout')?.wordWrap, false);
        await view.connection.receive({ type: 'setWordWrap', wrap: true });
        assert.strictEqual(view.settings.settings.wordWrap, true);
        await view.connection.receive({ type: 'ready' });
        assert.strictEqual(view.page.last('layout')?.wordWrap, true);
      });
    });

    test('shows the diffs of the other tabs with the whitespace and entire file choices made in another', async () => {
      const spaced = await tempRepository(path.join(folder, 'spaced-tabs'));
      await spaced.commit('first', { 'a.txt': fortyLines(-1) });
      await spaced.commit('indent', { 'a.txt': `  ${fortyLines(19)}` });
      const [indent] = await spaced.resolve('HEAD');
      await withView(log, [spaced.root, other], async (view) => {
        const patch = () => view.page.last('diff')?.patch ?? '';
        const selectTab = (root: string) =>
          view.connection.receive({ type: 'selectTab', root });
        await view.connection.receive({ type: 'pinEntireFile', pinned: false });
        await selectTab(spaced.root);
        await view.connection.receive({
          type: 'selectCommit',
          root: spaced.root,
          hash: indent,
        });
        assert.doesNotMatch(patch(), /^\+ {2}line 1$/m);

        await selectTab(other);
        await view.connection.receive({
          type: 'setIgnoreWhitespace',
          ignore: false,
        });
        await selectTab(spaced.root);
        assert.match(patch(), /^\+ {2}line 1$/m);

        await view.connection.receive({
          type: 'selectFile',
          root: spaced.root,
          hash: indent,
          path: 'a.txt',
        });
        assert.doesNotMatch(patch(), /^ line 40$/m);
        await selectTab(other);
        await view.connection.receive({ type: 'pinEntireFile', pinned: true });
        await selectTab(spaced.root);
        assert.match(patch(), /^ line 40$/m);
      });
    });

    test('opens the settings files through the app', async () => {
      const host = new FakeHost();
      await withView(
        log,
        [],
        async (view) => {
          await view.connection.receive({ type: 'openSettings' });
          await view.connection.receive({ type: 'openDefaultSettings' });
          assert.deepStrictEqual(host.opened, ['settings', 'defaults']);
        },
        false,
        host,
      );
    });

    test('says what is wrong with the settings when the page loads', async () => {
      const host = new FakeHost();
      host.problems = ['Unknown setting "sollo"'];
      await withView(
        log,
        [],
        async (view) => {
          assert.deepStrictEqual(view.page.last('notice'), {
            type: 'notice',
            level: 'error',
            message: 'Settings: Unknown setting "sollo"',
          });
        },
        true,
        host,
      );
    });

    test('shows the diff anew with settings changed by hand once the page loads again', async () => {
      const spaced = await tempRepository(path.join(folder, 'respaced'));
      await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
      await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
      const [indent] = await spaced.resolve('HEAD');
      await withView(log, [spaced.root], async (view) => {
        const changed = () =>
          /^[-+] {0,2}one$/m.test(view.page.last('diff')?.patch ?? '');
        await view.connection.receive({
          type: 'selectCommit',
          root: spaced.root,
          hash: indent,
        });
        assert.strictEqual(changed(), false);
        const file = path.join(folder, 'respaced.settings.json');
        fs.writeFileSync(file, JSON.stringify({ ignoreWhitespace: false }));
        const edited = new UserSettings(defaultSettings(), file);
        await view.settings.set(
          'ignoreWhitespace',
          edited.settings.ignoreWhitespace,
        );
        view.view.reloadSettings();
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
        assert.strictEqual(changed(), true);
      });
    });

    test('expands every merge once collapsing them is turned off by hand, also one expanded before', async () => {
      await withView(log, [repository.root], async (view) => {
        await view.connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
        assert.notStrictEqual(
          view.page.last('commits')?.graph[0]?.merge,
          'collapsed',
        );
        view.view.reloadSettings();
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        assert.notStrictEqual(
          view.page.last('commits')?.graph[0]?.merge,
          'collapsed',
        );
        await view.settings.set('collapseMerges', false);
        view.view.reloadSettings();
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        assert.notStrictEqual(
          view.page.last('commits')?.graph[0]?.merge,
          'collapsed',
        );
      });
    });

    test('saves the merge setting with no tab open', async () => {
      await withView(
        log,
        [],
        async (own) => {
          await own.connection.receive({
            type: 'setCollapseMerges',
            collapse: false,
          });
          assert.strictEqual(own.settings.settings.collapseMerges, false);
        },
        false,
      );
    });

    test('opens the repositories picked in new tabs, showing the last one', async () => {
      const third = await tempRepository(path.join(folder, 'third'));
      await third.commit('third');
      const recording = recordingLog();
      const host = new FakeHost();
      host.folders = [third.root, third.root, other];
      await withView(
        recording.log,
        [repository.root],
        async (view) => {
          await view.connection.receive({ type: 'browseRepositories' });
          const shown = view.page.last('tabs');
          assert.deepStrictEqual(
            shown?.tabs.map((tab) => tab.name),
            ['main', 'third', 'other'],
          );
          assert.ok(shown.active && sameRoot(shown.active, other));
          assert.strictEqual(
            view.page.last('repository')?.headCommit,
            otherHead,
          );
          const recent = view.store.get(recentKey);
          assert.ok(Array.isArray(recent));
          for (const root of [third.root, other]) {
            assert.ok(
              recent.some((saved) => sameRoot(saved, root)),
              root,
            );
          }
          await view.connection.receive({
            type: 'log',
            level: 'info',
            message: 'from the page',
          });
          assert.ok(recording.info.includes('Webview: from the page'));
        },
        true,
        host,
      );
    });

    test('opens a repository by a folder inside it', async () => {
      const inner = path.join(other, 'inner');
      fs.mkdirSync(inner, { recursive: true });
      const host = new FakeHost();
      host.folders = [inner];
      await withView(
        log,
        [repository.root],
        async (view) => {
          await view.connection.receive({ type: 'browseRepositories' });
          const shown = view.page.last('tabs');
          assert.deepStrictEqual(
            shown?.tabs.map((tab) => tab.name),
            ['main', 'other'],
          );
        },
        true,
        host,
      );
    });

    test('opens nothing when the folder dialog is cancelled', async () => {
      await withView(log, [repository.root], async (view) => {
        view.page.clear();
        await view.connection.receive({ type: 'browseRepositories' });
        assert.deepStrictEqual(
          view.page.last('tabs')?.tabs.map((tab) => tab.name),
          ['main'],
        );
        assert.strictEqual(view.page.last('notice'), undefined);
      });
    });

    test('offers the recent repositories that are not open in a tab', async () => {
      await withView(log, [repository.root], async (view) => {
        await view.store.update(recentKey, [other, repository.root]);
        await view.connection.receive({ type: 'sortTabs' });
        assert.deepStrictEqual(view.page.last('tabs')?.recent, [
          { root: other, name: 'other' },
        ]);
        await view.connection.receive({ type: 'openRepository', root: other });
        const shown = view.page.last('tabs');
        assert.ok(shown?.active && sameRoot(shown.active, other));
        assert.deepStrictEqual(shown.recent, []);
      });
    });

    test('forgets a recent folder that is no longer a repository, and says so', async () => {
      const gone = tempFolder('gone');
      try {
        await withView(log, [repository.root], async (view) => {
          await view.store.update(recentKey, [gone, other]);
          await view.connection.receive({ type: 'openRepository', root: gone });
          assert.match(
            view.page.last('notice')?.message ?? '',
            /is not in a git repository$/,
          );
          assert.deepStrictEqual(view.store.get(recentKey), [other]);
          assert.deepStrictEqual(
            view.page.last('tabs')?.tabs.map((tab) => tab.name),
            ['main'],
          );
        });
      } finally {
        removeFolder(gone);
      }
    });

    test('closes the only tab, leaving none shown but offering it again', async () => {
      await withView(log, [repository.root], async (view) => {
        for (const tab of view.page.last('tabs')?.tabs ?? []) {
          await view.connection.receive({ type: 'closeTab', root: tab.root });
        }
        assert.deepStrictEqual(view.page.last('tabs'), {
          type: 'tabs',
          tabs: [],
          active: undefined,
          recent: [{ root: repository.root, name: 'main' }],
        });
        assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, []);
        assert.strictEqual(view.page.last('error'), undefined);
      });
    });

    test('uses a repository cloned inside another, not the outer one', async () => {
      const outer = await tempRepository(path.join(folder, 'outer'));
      const nested = await tempRepository(path.join(outer.root, 'nested'), {
        branch: 'inner',
      });
      await nested.commit('inner');
      const [inner] = await nested.resolve('HEAD');
      await withView(log, [nested.root], async (view) => {
        const info = view.page.last('repository');
        assert.strictEqual(info?.head, 'inner');
        assert.strictEqual(info?.headCommit, inner);
      });
    });

    test('opens a repository without commits', async () => {
      const empty = await tempRepository(path.join(folder, 'empty'));
      fs.writeFileSync(path.join(empty.root, 'new.txt'), 'new\n');
      await withView(log, [empty.root], async (view) => {
        assert.strictEqual(view.page.last('error'), undefined);
        assert.strictEqual(view.page.last('commits')?.total, 0);
        assert.strictEqual(view.page.last('workingTree')?.files, 1);
      });
    });

    test('says nothing of a tab that fails to preload until it is opened', async () => {
      const plain = path.join(folder, 'plain');
      fs.mkdirSync(plain);
      await withView(log, [repository.root, plain], async (view) => {
        view.page.clear();
        await view.connection.receive({ type: 'preloadTab', root: plain });
        assert.strictEqual(view.page.last('error'), undefined);
        await view.connection.receive({ type: 'selectTab', root: plain });
        assert.match(
          view.page.last('error')?.message ?? '',
          /is not a git repository/,
        );
      });
    });

    test('leaves large files out of a commit diff until one is asked for', async () => {
      const large = await tempRepository(path.join(folder, 'large'));
      const lines = Array.from({ length: 2000 }, (_, index) => `line ${index}`);
      await large.commit('large', {
        'large.txt': lines.join('\n'),
        'small.txt': 'small\n',
      });
      const [hash] = await large.resolve('HEAD');
      await withView(log, [large.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash,
        });
        const patch = view.page.last('diff')?.patch ?? '';
        assert.ok(patch.includes('b/small.txt'), patch);
        assert.ok(!patch.includes('large.txt'), patch);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash,
          path: 'large.txt',
          diff: 1,
        });
        const fileDiff = view.page.last('fileDiff');
        assert.strictEqual(fileDiff?.path, 'large.txt');
        assert.ok(fileDiff?.patch.includes('+line 1999'));
        assert.strictEqual(fileDiff.diff, 1);
      });
    });

    test('sends an opened file left out of the uncommitted diff again once it changed on disk', async () => {
      const large = await tempRepository(path.join(folder, 'large-edited'));
      await large.commit('large', {
        'large.txt': numberedLines('line'),
        'small.txt': 'small\n',
      });
      const file = path.join(large.root, 'large.txt');
      fs.writeFileSync(file, numberedLines('first'));
      fs.writeFileSync(path.join(large.root, 'small.txt'), 'changed\n');
      await withView(log, [large.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash: workingTreeHash,
        });
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash: workingTreeHash,
          path: 'large.txt',
          diff: 1,
        });
        assert.ok(view.page.last('fileDiff')?.patch.includes('+first 1999'));
        view.page.clear();
        await view.connection.refresh();
        assert.strictEqual(view.page.last('fileDiff'), undefined);
        fs.writeFileSync(file, numberedLines('second'));
        await view.connection.refresh();
        assert.strictEqual(view.page.last('diff'), undefined);
        const fileDiff = view.page.last('fileDiff');
        assert.strictEqual(fileDiff?.diff, 1);
        assert.ok(fileDiff.patch.includes('+second 1999'));
      });
    });

    test('leaves the files past the budget out of a commit diff', async () => {
      const many = await tempRepository(path.join(folder, 'many'));
      const files = Math.ceil(patchLineBudget / collapseThreshold);
      const text = 'line\n'.repeat(collapseThreshold);
      await many.commit(
        'many',
        Object.fromEntries(
          Array.from({ length: files }, (_, index) => [
            `${String(index).padStart(2, '0')}.txt`,
            text,
          ]),
        ),
      );
      const [hash] = await many.resolve('HEAD');
      await withView(log, [many.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: many.root,
          hash,
        });
        assert.strictEqual(view.page.last('files')?.files.length, files);
        const patch = view.page.last('diff')?.patch ?? '';
        const last = `${String(files - 1).padStart(2, '0')}.txt`;
        assert.ok(patch.includes('b/00.txt'), patch.slice(0, 200));
        assert.ok(!patch.includes(last), last);
      });
    });

    test('leaves a file of one line past the bytes of the budget out of a commit diff', async () => {
      const bundled = await tempRepository(path.join(folder, 'bundled'));
      await bundled.commit('bundled', {
        'a.txt': 'small\n',
        'bundle.min.js': 'x'.repeat(patchByteBudget + 1),
      });
      const [hash] = await bundled.resolve('HEAD');
      await withView(log, [bundled.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: bundled.root,
          hash,
        });
        const patch = view.page.last('diff')?.patch ?? '';
        assert.ok(patch.includes('b/a.txt'), patch.slice(0, 200));
        assert.ok(!patch.includes('bundle.min.js'), patch.slice(0, 200));
      });
    });

    test('shows the diff of one file the commit changed, following a rename', async () => {
      const renamed = await tempRepository(path.join(folder, 'renamed'));
      const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
      await renamed.commit('old', {
        'old.txt': lines.join('\n'),
        'other.txt': 'one\n',
      });
      await renamed.git('mv', 'old.txt', 'new.txt');
      fs.writeFileSync(path.join(renamed.root, 'other.txt'), 'two\n');
      await renamed.git('commit', '-am', 'rename');
      const [hash] = await renamed.resolve('HEAD');
      await withView(log, [renamed.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: renamed.root,
          hash,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: renamed.root,
          hash,
          path: 'new.txt',
        });
        const diff = view.page.last('diff');
        assert.strictEqual(diff?.path, 'new.txt');
        assert.ok(diff.patch.includes('rename from old.txt'), diff.patch);
        assert.ok(!diff.patch.includes('other.txt'), diff.patch);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: renamed.root,
          hash,
          path: 'new.txt',
          diff: 1,
        });
        assert.ok(
          view.page.last('fileDiff')?.patch.includes('rename from old.txt'),
        );
      });
    });

    suite('with a file no commit changed since', () => {
      let files: TempRepository;
      let kept: string;
      let changed: string;

      suiteSetup(async () => {
        files = await tempRepository(path.join(folder, 'files'));
        await files.commit('kept', { 'kept.txt': 'kept\n' });
        await files.commit('changed', { 'changed.txt': 'changed\n' });
        [kept, changed] = await files.resolve('HEAD~1', 'HEAD');
      });

      test('shows a file the commit did not change whole, until another commit is selected', async () => {
        await withView(log, [files.root], async (view) => {
          await view.connection.receive({
            type: 'selectCommit',
            root: files.root,
            hash: changed,
          });
          await view.connection.receive({
            type: 'selectFile',
            root: files.root,
            hash: changed,
            path: 'kept.txt',
          });
          const content = view.page.last('fileContent');
          assert.strictEqual(content?.path, 'kept.txt');
          assert.strictEqual(content.content, 'kept\n');
          assert.strictEqual(content.binary, false);

          await view.connection.receive({
            type: 'selectCommit',
            root: files.root,
            hash: kept,
          });
          view.page.clear();
          await view.connection.receive({ type: 'ready' });
          const shown = view.page.messages.findLast(
            (message) =>
              message.type === 'diff' || message.type === 'fileContent',
          );
          assert.strictEqual(shown?.type, 'diff');
          assert.strictEqual(shown.hash, kept);
        });
      });

      test('sends no unchanged Files tree or whole file on a refresh', async () => {
        const draft = path.join(files.root, 'draft.txt');
        const added = path.join(files.root, 'new.txt');
        fs.writeFileSync(draft, 'draft\n');
        try {
          await withView(log, [files.root], async (view) => {
            await view.connection.receive({
              type: 'selectCommit',
              root: files.root,
              hash: workingTreeHash,
            });
            await view.connection.receive({
              type: 'loadTree',
              root: files.root,
              hash: workingTreeHash,
            });
            await view.connection.receive({
              type: 'selectFile',
              root: files.root,
              hash: workingTreeHash,
              path: 'kept.txt',
            });
            assert.strictEqual(
              view.page.last('fileContent')?.content,
              'kept\n',
            );
            view.page.clear();
            await view.connection.refresh();
            assert.ok(view.page.last('workingTree'));
            assert.strictEqual(view.page.last('tree'), undefined);
            assert.strictEqual(view.page.last('fileContent'), undefined);

            fs.writeFileSync(added, 'new\n');
            await view.connection.refresh();
            assert.ok(view.page.last('tree')?.paths.includes('new.txt'));
          });
        } finally {
          fs.rmSync(draft, { force: true });
          fs.rmSync(added, { force: true });
        }
      });
    });
  });
});

suite('Comparing', function () {
  this.timeout(30_000);

  let repository: TempRepository;
  let page: FakePage;
  let connection: Connection;
  let root: string;
  let feature: string;
  let main: string;

  const { log } = recordingLog();

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('view-compare'));
    await repository.commit('root', { 'shared.txt': 'one\ntwo\n' });
    await repository.git('checkout', '-b', 'feature');
    await repository.commit('feature', { 'shared.txt': 'one\nfeature\n' });
    await repository.git('checkout', 'main');
    await repository.commit('main', { 'main.txt': 'main only\n' });
    [root, feature, main] = await repository.resolve(
      'main~1',
      'feature',
      'main',
    );
  });

  suiteTeardown(() => removeFolder(repository.root));

  setup(async () => {
    ({ page, connection } = await openView(log, [repository.root]));
  });

  teardown(() => connection.dispose());

  const select = (hash: string) =>
    connection.receive({ type: 'selectCommit', root: repository.root, hash });

  test('diffs two commits on different branches, from the one selected first', async () => {
    const hash = comparisonOf(main, feature);
    await select(hash);
    assert.deepStrictEqual(
      page.last('files')?.files.map((file) => [file.status, file.path]),
      [
        ['D', 'main.txt'],
        ['M', 'shared.txt'],
      ],
    );
    assert.strictEqual(page.last('files')?.hash, hash);
    const diff = page.last('diff');
    assert.strictEqual(diff?.hash, hash);
    assert.match(diff.patch, /^-main only$/m);
    assert.match(diff.patch, /^\+feature$/m);

    await connection.receive({
      type: 'selectFile',
      root: repository.root,
      hash,
      path: 'shared.txt',
    });
    assert.strictEqual(page.last('diff')?.path, 'shared.txt');
    assert.doesNotMatch(page.last('diff')?.patch ?? '', /main only/);
    assert.strictEqual(page.last('error'), undefined);
  });

  test('shows a file left unchanged as it is in the commit compared to', async () => {
    await select(comparisonOf(root, main));
    await connection.receive({
      type: 'selectFile',
      root: repository.root,
      hash: comparisonOf(root, main),
      path: 'shared.txt',
    });
    assert.strictEqual(page.last('fileContent')?.content, 'one\ntwo\n');
    await connection.receive({
      type: 'loadTree',
      root: repository.root,
      hash: comparisonOf(root, main),
    });
    assert.deepStrictEqual(page.last('tree')?.paths, [
      'main.txt',
      'shared.txt',
    ]);
  });

  test('diffs a commit and the working tree either way, reading the uncommitted side from disk', async () => {
    const file = path.join(repository.root, 'shared.txt');
    fs.writeFileSync(file, 'one\ndisk\n');
    try {
      const forward = comparisonOf(root, workingTreeHash);
      await select(forward);
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => [change.status, change.path]),
        [
          ['A', 'main.txt'],
          ['M', 'shared.txt'],
        ],
      );
      assert.match(page.last('diff')?.patch ?? '', /^\+disk$/m);

      const backward = comparisonOf(workingTreeHash, main);
      await select(backward);
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => [change.status, change.path]),
        [['M', 'shared.txt']],
      );
      const patch = page.last('diff')?.patch ?? '';
      assert.match(patch, /^-disk$/m);
      assert.match(patch, /^\+two$/m);
      const [blob] = await repository.resolve('main:shared.txt');
      await connection.receive({
        type: 'loadTexts',
        root: repository.root,
        hash: backward,
        diff: 1,
        texts: [
          { path: 'shared.txt', side: 'old', blob: '1'.repeat(40) },
          { path: 'shared.txt', side: 'new', blob },
        ],
      });
      assert.deepStrictEqual(
        page.last('texts')?.texts.map(({ side, text }) => [side, text]),
        [
          ['old', 'one\ndisk\n'],
          ['new', 'one\ntwo\n'],
        ],
      );
    } finally {
      await repository.git('checkout', '--', 'shared.txt');
    }
  });

  test('updates a comparison with the working tree as files change', async () => {
    const draft = path.join(repository.root, 'draft.txt');
    await select(comparisonOf(main, workingTreeHash));
    assert.deepStrictEqual(page.last('files')?.files, []);
    fs.writeFileSync(draft, 'draft\n');
    try {
      await connection.refresh();
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => change.path),
        ['draft.txt'],
      );
      assert.match(page.last('diff')?.patch ?? '', /^\+draft$/m);
    } finally {
      fs.rmSync(draft, { force: true });
    }
  });

  test('goes back to a comparison, revealing the commit compared to', async () => {
    const hash = comparisonOf(root, feature);
    await select(main);
    await select(hash);
    await select(root);
    assert.deepStrictEqual(
      page.last('navigation')?.back.map((entry) => entry.hash),
      [hash, main],
    );
    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    const reveal = page.last('reveal');
    assert.strictEqual(reveal?.hash, hash);
    assert.strictEqual(
      reveal.index,
      page
        .last('commits')
        ?.commits.findIndex((commit) => commit.hash === feature),
    );
    assert.strictEqual(page.last('files')?.hash, hash);
    assert.strictEqual(page.last('error'), undefined);
  });

  test('says a comparison with a commit missing from the history is not in it', async () => {
    const hash = comparisonOf(main, '1'.repeat(40));
    await select(hash);
    assert.strictEqual(page.last('files'), undefined);
    assert.match(page.last('error')?.message ?? '', /is not in the history/);
  });
});

suite('Fetch', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log } = recordingLog();
  const interactive = process.env.GCM_INTERACTIVE;

  suiteSetup(async () => {
    delete process.env.GCM_INTERACTIVE;
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(log, [repository.root]));
  });

  suiteTeardown(() => {
    connection.dispose();
    removeFolder(folder);
    if (interactive !== undefined) {
      process.env.GCM_INTERACTIVE = interactive;
    }
  });

  test('updates by itself when a fetch brings new commits', async () => {
    const elsewhere = await tempRepository(path.join(folder, 'elsewhere'));
    await elsewhere.git('pull', remote.root, 'main');
    await elsewhere.commit('from elsewhere');
    await elsewhere.git('push', remote.root, 'main');
    const [fetched] = await elsewhere.resolve('HEAD');
    page.clear();
    try {
      await repository.git('fetch');
      await waitFor(
        () =>
          page
            .last('repository')
            ?.refs.some(
              (ref) => ref.name === 'origin/main' && ref.commit === fetched,
            ) === true && page.last('commits') !== undefined,
        'the fetched commit and the reloaded history',
      );
    } finally {
      await repository.git('merge', '--ff-only', 'origin/main');
      await connection.refresh();
    }
  });

  test('updates by itself when a file changes in the working tree', async () => {
    page.clear();
    fs.writeFileSync(path.join(repository.root, 'edited.txt'), 'edited\n');
    try {
      await waitFor(
        () => page.last('workingTree')?.files === 1,
        'the changed file to show',
      );
    } finally {
      fs.rmSync(path.join(repository.root, 'edited.txt'));
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('reads the refs again by itself only when the git folder changes', async () => {
    const opened = await openView(log, [repository.root]);
    let reads = 0;
    stubMethod(opened.view, 'refsOf', (original, ...args) => {
      reads++;
      return original(...args);
    });
    const file = path.join(repository.root, 'saved.txt');
    try {
      fs.writeFileSync(file, 'saved\n');
      await waitFor(
        () => opened.page.last('workingTree')?.files === 1,
        'the saved file to show',
      );
      assert.strictEqual(reads, 0);
      await repository.git('tag', 'watched');
      await waitFor(
        () =>
          opened.page
            .last('repository')
            ?.refs.some((ref) => ref.name === 'watched') === true,
        'the new tag',
      );
      assert.ok(reads > 0);
    } finally {
      opened.connection.dispose();
      fs.rmSync(file);
      await repository.git('update-ref', '-d', 'refs/tags/watched');
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('updates by itself when a file changes in a submodule', async () => {
    const library = await tempRepository(path.join(folder, 'library'));
    await library.commit('library', { 'lib.c': 'lib\n' });
    const host = await tempRepository(path.join(folder, 'host'));
    await host.commit('host');
    await host.git(
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      library.root,
      'sub',
    );
    await host.git('commit', '-m', 'adds sub');
    const opened = await openView(log, [host.root]);
    try {
      await waitFor(
        () => opened.page.last('workingTree')?.files === 0,
        'the clean working tree',
      );
      opened.page.clear();
      fs.writeFileSync(path.join(host.root, 'sub', 'lib.c'), 'edited\n');
      await waitFor(
        () => opened.page.last('workingTree')?.files === 1,
        'the changed submodule to show',
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('keeps updating a tab opened again while the watcher of the closed one still starts', async () => {
    const second = await tempRepository(path.join(folder, 'second-watched'));
    await second.commit('second');
    const opened = await openView(log, [repository.root, second.root], false);
    const started: (() => void)[] = [];
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      const watcher = await original(...args);
      const held = gate();
      started.push(held.open);
      await held.opened;
      return watcher;
    });
    try {
      const handled = [opened.connection.receive({ type: 'ready' })];
      await waitFor(() => started.length === 1, 'the first watcher');
      handled.push(
        opened.connection.receive({ type: 'closeTab', root: repository.root }),
      );
      await waitFor(() => started.length === 2, "the next tab's watcher");
      handled.push(
        opened.connection.receive({
          type: 'openRepository',
          root: repository.root,
        }),
      );
      await waitFor(() => started.length === 3, "the reopened tab's watcher");
      for (const open of started) {
        open();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all(handled);
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the working tree',
      );
      opened.page.clear();
      fs.writeFileSync(path.join(repository.root, 'watched.txt'), 'new\n');
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the reopened tab to update',
      );
    } finally {
      opened.connection.dispose();
      fs.rmSync(path.join(repository.root, 'watched.txt'), { force: true });
    }
  });

  test('leaves ignored files changing alone', async () => {
    fs.writeFileSync(
      path.join(repository.root, '.git', 'info', 'exclude'),
      'build/\n',
    );
    fs.mkdirSync(path.join(repository.root, 'build'));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    page.clear();
    fs.writeFileSync(path.join(repository.root, 'build', 'out.txt'), 'built\n');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.strictEqual(page.last('workingTree'), undefined);
  });

  test('fetches every remote, dropping branches deleted there', async () => {
    await remote.git('branch', 'short-lived', 'main');
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () =>
        page
          .last('repository')
          ?.refs.some((ref) => ref.name === 'origin/short-lived') === true,
      'the fetched branch',
    );
    await remote.git('branch', '-D', 'short-lived');
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () =>
        page
          .last('repository')
          ?.refs.every((ref) => ref.name !== 'origin/short-lived') === true,
      'the deleted branch to go',
    );
    assert.strictEqual(page.last('fetching')?.running, false);
  });

  test('fetches every open repository while pinned, telling of a failure once until one succeeds', async () => {
    const broken = await tempRepository(path.join(folder, 'broken'));
    await broken.commit('a');
    await broken.git('remote', 'add', 'origin', path.join(folder, 'missing'));
    const pusher = await tempRepository(path.join(folder, 'pusher'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('pushed');
    await pusher.git('push', remote.root, 'main');
    const [pushed] = await pusher.resolve('HEAD');
    const rounds: (() => void)[] = [];
    const view = await openView(
      log,
      [broken.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    try {
      await withNotices(view.page, 'error', async (messages) => {
        await view.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the first round');
        assert.deepStrictEqual(await repository.resolve('origin/main'), [
          pushed,
        ]);
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^broken: Couldn't fetch\./);
        assert.strictEqual(view.page.last('fetching'), undefined);
        assert.strictEqual(view.settings.settings.autoFetch, true);

        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        assert.strictEqual(messages.length, 1);

        await broken.git('remote', 'set-url', 'origin', remote.root);
        rounds[1]();
        await waitFor(() => rounds.length === 3, 'the third round');
        await broken.git('remote', 'set-url', 'origin', folder);
        rounds[2]();
        await waitFor(() => rounds.length === 4, 'the fourth round');
        assert.strictEqual(messages.length, 2);
      });
    } finally {
      view.connection.dispose();
    }
  });

  test('keeps the selected commit, its files and diff, and the place in the list as a background fetch brings commits and branches', async () => {
    await repository.commit('kept', { 'kept.txt': 'kept\n' });
    const [kept] = await repository.resolve('HEAD');
    const pusher = await tempRepository(path.join(folder, 'pusher-kept'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('newer');
    await pusher.git('push', remote.root, 'main:main', 'main:brand-new');
    const rounds: (() => void)[] = [];
    const view = await openView(
      log,
      [repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    const { page: shown, connection: open } = view;
    try {
      await open.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: kept,
      });
      await open.receive({
        type: 'selectFile',
        root: repository.root,
        hash: kept,
        path: 'kept.txt',
      });
      await open.receive({
        type: 'scrolled',
        root: repository.root,
        hash: kept,
        offset: 7,
      });
      assert.ok(shown.last('diff')?.patch.includes('+kept'));
      const before = shown.last('commits')?.total ?? 0;
      shown.clear();
      await open.receive({ type: 'setAutoFetch', on: true });
      await waitFor(
        () =>
          shown
            .last('repository')
            ?.refs.some((ref) => ref.name === 'origin/brand-new') === true &&
          shown.last('commits') !== undefined,
        'the fetched branch and the reloaded history',
      );
      await waitFor(() => rounds.length === 1, 'the round to end');
      const commits = shown.last('commits');
      const index = commits?.selectedIndex ?? -1;
      assert.strictEqual(
        commits?.commits[index - (commits?.start ?? 0)]?.hash,
        kept,
      );
      assert.deepStrictEqual(commits?.scrollTarget, { index, offset: 7 });
      assert.ok((commits?.total ?? 0) > before);
      for (const type of ['files', 'diff', 'fileContent', 'error'] as const) {
        assert.strictEqual(shown.last(type), undefined, type);
      }
    } finally {
      open.dispose();
    }
  });

  test('fetches the active repository first in the background', async () => {
    const first = await tempRepository(path.join(folder, 'first-in-strip'));
    await first.commit('first');
    const view = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      () => () => undefined,
    );
    const fetched: unknown[] = [];
    stubMethod(view.view, 'fetchInBackground', (_original, root) => {
      fetched.push(root);
      return Promise.resolve();
    });
    try {
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      await view.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => fetched.length === 2, 'the round');
      assert.deepStrictEqual(fetched, [repository.root, first.root]);
    } finally {
      view.connection.dispose();
    }
  });

  test('shows what a background fetch brought to a tab selected while it ran', async () => {
    const first = await tempRepository(path.join(folder, 'first-selected'));
    await first.commit('first');
    const pusher = await tempRepository(path.join(folder, 'pusher-selected'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('brought');
    await pusher.git('push', remote.root, 'main');
    const [brought] = await pusher.resolve('HEAD');
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'watch', () => Promise.resolve());
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (
        typeof context === 'object' &&
        context !== null &&
        'root' in context &&
        context.root === repository.root
      ) {
        await opened.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
      }
      return original(...args);
    });
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      await waitFor(
        () =>
          opened.page
            .last('repository')
            ?.refs.some(
              (ref) => ref.name === 'origin/main' && ref.commit === brought,
            ) === true,
        'the fetched branch',
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('leaves a tab closed during a background round unfetched', async () => {
    const first = await tempRepository(path.join(folder, 'first-closed'));
    await first.commit('first');
    const pusher = await tempRepository(path.join(folder, 'pusher-closed'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('unfetched');
    await pusher.git('push', remote.root, 'main');
    const [before] = await repository.resolve('origin/main');
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (
        typeof context === 'object' &&
        context !== null &&
        'root' in context &&
        context.root === first.root
      ) {
        await opened.connection.receive({
          type: 'closeTab',
          root: repository.root,
        });
      }
      return original(...args);
    });
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      assert.deepStrictEqual(await repository.resolve('origin/main'), [before]);
    } finally {
      opened.connection.dispose();
      await repository.git('fetch');
    }
  });

  test('tells nothing of a background fetch failing for a tab closed while it ran', async () => {
    const closing = await tempRepository(path.join(folder, 'closing'));
    await closing.commit('a');
    await closing.git('remote', 'add', 'origin', path.join(folder, 'gone'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [repository.root, closing.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (
        typeof context === 'object' &&
        context !== null &&
        'root' in context &&
        context.root === closing.root
      ) {
        await opened.connection.receive({
          type: 'closeTab',
          root: closing.root,
        });
      }
      return original(...args);
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the round to end');
        assert.deepStrictEqual(messages, []);
      });
    } finally {
      opened.connection.dispose();
    }
  });

  test('says when a fetch asked for fails, even while a background fetch that keeps quiet runs', async () => {
    const failing = await tempRepository(path.join(folder, 'failing'));
    await failing.commit('a');
    await failing.git('remote', 'add', 'origin', path.join(folder, 'absent'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [failing.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let asked: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (rounds.length === 1 && args[3] === false) {
        asked ??= opened.connection.receive({
          type: 'fetch',
          root: failing.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the first round');
        assert.strictEqual(messages.length, 1);
        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        await asked;
        assert.strictEqual(messages.length, 2);
        assert.match(messages[1] ?? '', /^Couldn't fetch./);
      });
    } finally {
      opened.connection.dispose();
    }
  });

  test('lets only a fetch asked for, not one in the background, ask for credentials', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const { port } = address;
    const locked = await tempRepository(path.join(folder, 'locked'));
    await locked.commit('a');
    await locked.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/x`);
    const asked = path.join(folder, 'asked.txt').replaceAll('\\', '/');
    await locked.git('config', 'credential.helper', '');
    await locked.git(
      'config',
      '--add',
      'credential.helper',
      `!f() { test "$1" = get || exit 0; echo "[$GCM_INTERACTIVE]" >> '${asked}'; echo username=u; echo password=p; }; f`,
    );
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      await opened.connection.receive({ type: 'fetch', root: locked.root });
      assert.deepStrictEqual(
        fs.readFileSync(asked, 'utf8').trim().split('\n'),
        ['[never]', '[]'],
      );
    } finally {
      opened.connection.dispose();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('lets a fetch asked for while a background one runs ask for credentials, and says it failed once', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const { port } = address;
    const locked = await tempRepository(path.join(folder, 'joined'));
    await locked.commit('a');
    await locked.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/x`);
    const asked = path.join(folder, 'joined.txt').replaceAll('\\', '/');
    await locked.git('config', 'credential.helper', '');
    await locked.git(
      'config',
      '--add',
      'credential.helper',
      `!f() { test "$1" = get || exit 0; echo "[$GCM_INTERACTIVE]" >> '${asked}'; echo username=u; echo password=p; }; f`,
    );
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let manual: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] === false) {
        manual ??= opened.connection.receive({
          type: 'fetch',
          root: locked.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the round to end');
        await manual;
        assert.deepStrictEqual(
          fs.readFileSync(asked, 'utf8').trim().split('\n'),
          ['[never]', '[]'],
        );
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
    } finally {
      opened.connection.dispose();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('says once that a fetch failed when a background one joins it', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const { port } = address;
    const locked = await tempRepository(path.join(folder, 'joining'));
    await locked.commit('a');
    await locked.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/x`);
    await locked.git('config', 'credential.helper', '');
    await locked.git(
      'config',
      '--add',
      'credential.helper',
      '!f() { echo username=u; echo password=p; }; f',
    );
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let background: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] !== false) {
        background ??= opened.connection.receive({
          type: 'setAutoFetch',
          on: true,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'fetch', root: locked.root });
        await background;
        await waitFor(() => rounds.length === 1, 'the round to end');
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
    } finally {
      opened.connection.dispose();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('says so when a fetch fails, and stops fetching', async () => {
    await repository.git(
      'remote',
      'add',
      'broken',
      path.join(folder, 'missing'),
    );
    try {
      await withNotices(page, 'error', async (messages) => {
        page.clear();
        await connection.receive({ type: 'fetch', root: repository.root });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
        assert.strictEqual(page.last('fetching')?.running, false);
        assert.ok(page.last('workingTree'));
      });
    } finally {
      await repository.git('remote', 'remove', 'broken');
    }
  });
});
