import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  workingTreeHash,
  type ToWebview,
  type ToWebviewOf,
  type BookmarkRef,
} from '../shared/protocol';
import type { Log } from '../log';
import {
  activeTabKey,
  bookmarksKey,
  collapseMergesKey,
  recentKey,
  sameRoot,
  soloKey,
  Storage,
  tabsKey,
} from '../storage';
import { FastforwardView, type Connection, type Host } from '../view';
import { FakeStore } from './fakeStore';
import { waitFor } from './fixtures';
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
}

class FakeHost implements Host {
  folders: readonly string[] = [];

  chooseFolders(): Promise<readonly string[]> {
    return Promise.resolve(this.folders);
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

async function openView(
  log: Log,
  tabs: readonly string[],
  ready = true,
  host: Host = new FakeHost(),
): Promise<OpenView> {
  const store = new FakeStore();
  await store.update(tabsKey, tabs);
  await store.update(activeTabKey, tabs[0]);
  const view = new FastforwardView(
    log,
    await installedGit(),
    new Storage(store),
    host,
  );
  const { page, connection } = attach(view);
  if (ready) {
    await connection.receive({ type: 'ready' });
  }
  return { view, page, connection, store };
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

function gate(): { opened: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { opened: promise, open: () => resolve() };
}

function stubMethod<T = void>(
  view: FastforwardView,
  name: string,
  replace: (
    original: (...args: unknown[]) => Promise<T>,
    ...args: unknown[]
  ) => Promise<T>,
): void {
  const original: unknown = Reflect.get(view, name);
  assert.ok(typeof original === 'function', name);
  Reflect.set(view, name, (...args: unknown[]) =>
    replace(
      (...inner) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        Reflect.apply(original, view, inner) as Promise<T>,
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

function savedBookmarks(store: FakeStore): Record<string, BookmarkRef[]> {
  return store.get<Record<string, BookmarkRef[]>>(bookmarksKey, {});
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
      stubMethod<string>(fastforward, 'patchOf', async (original, ...args) => {
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
      assert.deepStrictEqual(savedBookmarks(store)[repository.root], []);
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
        stubMethod<object>(
          fastforward,
          'context',
          async (original, ...args) => ({
            ...(await original(...args)),
            root: elsewhere,
          }),
        );
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
      assert.deepStrictEqual(page.last('hashLookup'), {
        type: 'hashLookup',
        query: typed,
        result: { kind: 'found', hash: fixture.b, subject: 'b' },
      });
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: 'ffffff0',
      });
      assert.deepStrictEqual(page.last('hashLookup')?.result, { kind: 'none' });
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
      stubMethod<string>(fastforward, 'patchOf', async (original, ...args) => {
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
        await connection.receive({ type: 'setSolo', solo: true });
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
        assert.strictEqual(store.get(soloKey), true);
        await connection.receive({ type: 'setSolo', solo: false });
        assert.strictEqual(page.last('commits')?.total, 4);
      } finally {
        await store.update(soloKey, false);
        await repository.git('branch', '-D', 'side');
      }
    });

    test('saves the layout and sends it when the page loads', async () => {
      assert.strictEqual(page.last('layout')?.changesView, 'tree');
      await connection.receive({
        type: 'setColumnWidths',
        widths: [400, 250],
      });
      await connection.receive({ type: 'setFilesMode', mode: 'files' });
      await connection.receive({ type: 'setChangesView', view: 'list' });
      await connection.receive({ type: 'ready' });
      const layout = page.last('layout');
      assert.deepStrictEqual(layout?.columnWidths, [400, 250]);
      assert.strictEqual(layout.filesMode, 'files');
      assert.strictEqual(layout.changesView, 'list');
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
      assert.strictEqual(tabs.store.get(collapseMergesKey), false);
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.strictEqual(tabs.page.last('commits')?.total, 5);
    });

    test('reloads other tabs for a changed solo setting when they come back', async () => {
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      await repository.git('branch', 'side', side);
      try {
        await tabs.connection.refresh();
        assert.strictEqual(tabs.page.last('commits')?.total, 4);
        await tabs.connection.receive({ type: 'selectTab', root: other });
        await tabs.connection.receive({ type: 'setSolo', solo: true });
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        assert.strictEqual(tabs.page.last('commits')?.total, 3);
      } finally {
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
      const saved = savedBookmarks(tabs.store);
      assert.deepStrictEqual(saved[repository.root], []);
      assert.deepStrictEqual(saved[other], [{ kind: 'branch', name: 'main' }]);

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
      // Without the tab of the repository open in VS Code, which the view
      // adds first when the Git extension has opened it
      const ours = new Set(['main', 'other', 'Zeta']);
      await withView(log, [other, zeta.root, repository.root], async (own) => {
        const names = () =>
          (own.page.last('tabs')?.tabs ?? [])
            .map((tab) => tab.name)
            .filter((name) => ours.has(name));
        await own.connection.receive({ type: 'sortTabs' });
        assert.deepStrictEqual(names(), ['main', 'other', 'Zeta']);
        await own.connection.receive({ type: 'closeTab', root: other });
        const left = own.page.last('tabs');
        assert.deepStrictEqual(names(), ['main', 'Zeta']);
        assert.strictEqual(left?.active, zeta.root);
      });
    });
  });

  suite('of other repositories', () => {
    test('saves the merge setting with no tab open', async () => {
      await withView(
        log,
        [],
        async (own) => {
          await own.connection.receive({
            type: 'setCollapseMerges',
            collapse: false,
          });
          assert.strictEqual(own.store.get(collapseMergesKey), false);
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
          const recent = view.store.get<string[]>(recentKey, []);
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

suite('Fetch', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log } = recordingLog();

  suiteSetup(async () => {
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
