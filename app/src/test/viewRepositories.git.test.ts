import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from './builtins';
import { workingTreeHash } from '../shared/protocol';
import { recentKey, sameRoot } from '../storage';
import {
  asIfOwnedByAnother,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { waitFor } from './fixtures';
import { recordingLog } from './stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  gate,
  reopen,
  restoreRepository,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withNotices,
  withView,
  type ViewRepositories,
} from './viewHarness';

suite('View of other repositories', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];
  let other: string;
  let otherHead: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture, other, otherHead } =
      await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('reads the history again when the settings change by hand only once they show other commits, as reading it takes seconds in large repositories', async () => {
    await withView(log, [repository.root], async (view) => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let reads = 0;
      replaceBuiltin(
        childProcess,
        'spawn',
        (command: string, args: readonly string[], options: object) => {
          if (args.includes('rev-list') && args.includes('--parents')) {
            reads++;
          }
          return spawn(command, args, options);
        },
      );
      try {
        const reload = async () => {
          view.view.reloadSettings();
          view.page.clear();
          await view.connection.receive({ type: 'ready' });
        };
        await reload();
        await view.settings.set('collapseMerges', false);
        await reload();
        assert.strictEqual(reads, 0);
        assert.notStrictEqual(
          view.page.last('commits')?.graph[0]?.merge,
          'collapsed',
        );
        await view.settings.set('solo', true);
        await reload();
        assert.strictEqual(reads, 1);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        await view.settings.set('collapseMerges', true);
        await view.settings.set('solo', false);
      }
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

  test('reads the history again once the settings turn solo on while it is read', async () => {
    const [tree] = await repository.resolve('HEAD^{tree}');
    const side = (
      await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
    ).trim();
    await repository.git('branch', 'side', side);
    try {
      await withView(
        log,
        [repository.root],
        async (view) => {
          const held = gate();
          let reading = false;
          stubMethod(
            view.view,
            'listFullHistory',
            async (original, ...args) => {
              const listed = await original(...args);
              if (!reading) {
                reading = true;
                await held.opened;
              }
              return listed;
            },
          );
          const ready = view.connection.receive({ type: 'ready' });
          await waitFor(() => reading, 'the history to be read');
          await view.settings.set('solo', true);
          view.view.reloadSettings();
          view.connection.dispose();
          const reloaded = reopen(view.view);
          await waitFor(
            () => reloaded.page.last('tabs') !== undefined,
            'the page to load again',
          );
          held.open();
          await Promise.all([ready, reloaded.ready]);
          assert.strictEqual(reloaded.page.last('solo')?.solo, true);
          assert.strictEqual(reloaded.page.last('commits')?.total, 3);
        },
        false,
      );
    } finally {
      await repository.git('branch', '-D', 'side');
    }
  });

  test('reads the history again once the settings turn solo on while a refresh extends it', async () => {
    const [tree] = await repository.resolve('HEAD^{tree}');
    const side = (
      await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
    ).trim();
    await repository.git('branch', 'side', side);
    try {
      await withView(
        log,
        [repository.root],
        async (view) => {
          assert.strictEqual(view.page.last('commits')?.total, 4);
          const held = gate();
          let extending = false;
          stubMethod(
            view.view,
            'extendedHistory',
            async (original, ...args) => {
              const extended = await original(...args);
              extending = true;
              await held.opened;
              return extended;
            },
          );
          await repository.commit('c');
          const [c] = await repository.resolve('main');
          const refreshing = view.connection.refresh();
          await waitFor(() => extending, 'the history to be extended');
          await view.settings.set('solo', true);
          view.view.reloadSettings();
          view.connection.dispose();
          const reloaded = reopen(view.view);
          await waitFor(
            () => reloaded.page.last('tabs') !== undefined,
            'the page to load again',
          );
          held.open();
          await Promise.all([refreshing, reloaded.ready]);
          const shown = reloaded.page.last('commits');
          assert.strictEqual(shown?.total, 4);
          assert.strictEqual(shown.commits[0]?.hash, c);
        },
        'unwatched',
      );
    } finally {
      await restoreRepository(repository, fixture.merge);
      await repository.git('branch', '-D', 'side');
    }
  });

  test('shows the first rows of a long history while the whole of it is read, waiting for it to show a commit further down, as reading it whole takes seconds in large repositories', async () => {
    const held = gate();
    await withView(
      log,
      [repository.root],
      async (view) => {
        stubMethod(view.view, 'listRecentHistory', (original, ...args) =>
          original(...args.slice(0, 4), 2),
        );
        stubMethod(view.view, 'listFullHistory', async (original, ...args) => {
          await held.opened;
          return original(...args);
        });
        const ready = view.connection.receive({ type: 'ready' });
        await waitFor(
          () => view.page.last('commits') !== undefined,
          'the first rows',
        );
        const first = view.page.last('commits');
        assert.deepStrictEqual(
          first?.commits.map((commit) => commit.hash),
          [fixture.merge, fixture.b],
        );
        assert.strictEqual(first.total, 2);
        assert.strictEqual(first.graph[0]?.hidden, undefined);
        const selecting = view.connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.a,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        held.open();
        await Promise.all([ready, selecting]);
        const whole = view.page.last('commits');
        assert.strictEqual(whole?.total, 3);
        assert.strictEqual(whole.graph[0]?.hidden, 2);
        assert.strictEqual(view.page.last('files')?.hash, fixture.a);
        assert.strictEqual(view.page.last('error'), undefined);
      },
      false,
    );
  });

  test('shows no first rows apart from the whole history when the first commits read are all of it', async () => {
    const held = gate();
    await withView(
      log,
      [repository.root],
      async (view) => {
        const recent = gate();
        stubMethod(
          view.view,
          'listRecentHistory',
          async (original, ...args) => {
            const listed = await original(...args);
            recent.open();
            return listed;
          },
        );
        stubMethod(view.view, 'listFullHistory', async (original, ...args) => {
          await held.opened;
          return original(...args);
        });
        const ready = view.connection.receive({ type: 'ready' });
        await recent.opened;
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.strictEqual(view.page.last('commits'), undefined);
        held.open();
        await ready;
        assert.strictEqual(commitsSent(view.page.messages), 1);
      },
      false,
    );
  });

  test('reads no first rows apart from the whole history of a repository without a commit-graph, as git would sort the whole history to find its newest commits', async () => {
    await withView(
      log,
      [other],
      async (view) => {
        let recentReads = 0;
        stubMethod(view.view, 'listRecentHistory', (original, ...args) => {
          recentReads++;
          return original(...args);
        });
        await view.connection.receive({ type: 'ready' });
        assert.strictEqual(view.page.last('commits')?.total, 1);
        assert.strictEqual(recentReads, 0);
      },
      false,
    );
  });

  test('opens the repositories picked in new tabs, showing the last one', async () => {
    const third = await tempRepository(path.join(folder, 'third'));
    await third.commit('third');
    const host = new FakeHost();
    host.folders = [third.root, third.root, other];
    await withView(
      log,
      [repository.root],
      async (view) => {
        await view.connection.receive({ type: 'browseRepositories' });
        const shown = view.page.last('tabs');
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['main', 'third', 'other'],
        );
        assert.ok(shown.active && sameRoot(shown.active, other));
        assert.strictEqual(view.page.last('repository')?.headCommit, otherHead);
        const recent = view.store.get(recentKey);
        assert.ok(Array.isArray(recent));
        for (const root of [third.root, other]) {
          assert.ok(
            recent.some((saved) => sameRoot(saved, root)),
            root,
          );
        }
      },
      true,
      host,
    );
  });

  test('forgets a recent repository on asking, telling the page the list without it', async () => {
    const gone = path.join(folder, 'gone-for-good');
    await withView(log, [repository.root], async (view) => {
      await view.store.update(recentKey, [gone, repository.root]);
      await view.connection.receive({ type: 'forgetRecent', root: gone });
      assert.deepStrictEqual(view.store.get(recentKey), [repository.root]);
      assert.ok(
        view.page
          .last('tabs')
          ?.recent.every((shown) => !sameRoot(shown.root, gone)),
      );
    });
  });

  for (const [opened, tabs] of [
    ['a tab', () => [repository.root]],
    ['no tab', () => []],
  ] as const) {
    test(`opens the repository picked in the page loaded again while the folder dialog was open, with ${opened} shown`, async () => {
      const picked = Promise.withResolvers<readonly string[]>();
      const host = new FakeHost();
      host.chooseFolders = () => picked.promise;
      await withView(
        log,
        tabs(),
        async (view) => {
          const browsing = view.connection.receive({
            type: 'browseRepositories',
          });
          view.connection.dispose();
          const reloaded = reopen(view.view);
          try {
            await reloaded.ready;
            picked.resolve([other]);
            await browsing;
            const shown = reloaded.page.last('tabs');
            assert.ok(shown?.active && sameRoot(shown.active, other));
            assert.strictEqual(
              reloaded.page.last('repository')?.headCommit,
              otherHead,
            );
            assert.strictEqual(reloaded.page.last('commits')?.total, 1);
          } finally {
            reloaded.connection.dispose();
          }
        },
        'unwatched',
        host,
      );
    });
  }

  test('logs what the page sends at its level, marked as from the webview', async () => {
    const recording = recordingLog();
    await withView(recording.log, [], async (view) => {
      await view.connection.receive({
        type: 'log',
        level: 'info',
        message: 'from the page',
      });
      await view.connection.receive({
        type: 'log',
        level: 'error',
        message: 'failed in the page',
      });
      assert.ok(recording.info.includes('Webview: from the page'));
      assert.deepStrictEqual(recording.error, ['Webview: failed in the page']);
    });
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

  test('offers the recent repositories that are not open in a tab, out of the 20 kept, which count those that are', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.store.update(recentKey, [other, repository.root]);
      await view.connection.receive({ type: 'sortTabs' });
      assert.deepStrictEqual(view.page.last('tabs')?.recent, [
        { root: other, name: 'other' },
      ]);
      const older = Array.from({ length: 19 }, (_, index) =>
        path.join(folder, `older-${index}`),
      );
      await view.store.update(recentKey, [repository.root, ...older, other]);
      await view.connection.receive({ type: 'openRepository', root: other });
      const shown = view.page.last('tabs');
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.deepStrictEqual(
        shown.recent.map((recent) => recent.root),
        older.slice(0, 18),
      );
    });
  });

  test('opens only the recent repositories the page names', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.store.update(recentKey, []);
      await view.connection.receive({ type: 'openRepository', root: other });
      assert.deepStrictEqual(
        view.page.last('tabs')?.tabs.map((tab) => tab.name),
        ['main'],
      );
      assert.deepStrictEqual(view.store.get(recentKey), []);
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

  test('keeps a recent repository git refuses to open, and says what git said', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.store.update(recentKey, [other]);
      await asIfOwnedByAnother(other, () =>
        view.connection.receive({ type: 'openRepository', root: other }),
      );
      assert.match(
        view.page.last('notice')?.message ?? '',
        /^Couldn't open .*other\. fatal: detected dubious ownership/,
      );
      assert.deepStrictEqual(view.store.get(recentKey), [other]);
      assert.deepStrictEqual(
        view.page.last('tabs')?.tabs.map((tab) => tab.name),
        ['main'],
      );
    });
    takeErrorsLogged(
      logged,
      /^Opening .*other failed$/,
      /^git rev-parse .* failed: fatal: detected dubious ownership/,
    );
  });

  test('says what git said of a tab it refuses to open', async () => {
    await withView(log, [repository.root, other], async (view) => {
      await asIfOwnedByAnother(other, () =>
        view.connection.receive({ type: 'selectTab', root: other }),
      );
      assert.match(
        view.page.last('error')?.message ?? '',
        /^fatal: detected dubious ownership/,
      );
    });
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*other failed$/,
      /^Handling selectTab from the page failed$/,
      /^git .* failed: fatal: detected dubious ownership/,
    );
  });

  test('opens a tab git refused to open once it is clicked again, or its worktree is, after git no longer refuses it', async () => {
    await withView(log, [repository.root, other], async (view) => {
      for (const again of [
        () => view.connection.receive({ type: 'selectTab', root: other }),
        () => view.connection.receive({ type: 'selectWorktree', root: other }),
      ]) {
        await asIfOwnedByAnother(other, () =>
          view.connection.receive({ type: 'selectTab', root: other }),
        );
        view.page.clear();
        await again();
        assert.ok(view.page.last('repository'), String(again));
        await view.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
      }
    });
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*other failed$/,
      /^Handling selectTab from the page failed$/,
      /^git .* failed: fatal: detected dubious ownership/,
    );
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
        worktree: undefined,
        worktrees: [],
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

  test("says a repository whose folder is removed while open is not a repository, rather than that it can't be watched", async () => {
    const removed = await tempRepository(path.join(folder, 'removed'));
    await removed.commit('first');
    await withView(log, [removed.root, repository.root], async (view) => {
      assert.strictEqual(view.page.last('error'), undefined);
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      removeFolder(removed.root);
      await withNotices(view.page, 'error', async (notices) => {
        await view.connection.receive({
          type: 'selectTab',
          root: removed.root,
        });
        assert.deepStrictEqual(notices, []);
      });
      assert.match(
        view.page.last('error')?.message ?? '',
        /is not a git repository/,
      );
    });
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*removed failed$/,
      /^Handling selectTab from the page failed$/,
      /^git .* failed: spawn .* ENOENT$/,
    );
  });

  test('makes the main branch a bookmark once a repository opened without commits has one', async () => {
    const empty = await tempRepository(path.join(folder, 'unborn'));
    await withView(
      log,
      [empty.root],
      async (view) => {
        assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, []);
        await empty.commit('first');
        await view.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, [
          { kind: 'branch', name: 'main' },
        ]);
        assert.deepStrictEqual(savedBookmarks(view.store, empty.root), [
          { kind: 'branch', name: 'main' },
        ]);
      },
      'unwatched',
    );
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
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*plain failed$/,
      /^git worktree list .* failed: fatal: not a git repository/,
    );
  });

  test('opens the tab shown again when it is clicked once its folder, missing as it opened, is a repository', async () => {
    const later = path.join(folder, 'later');
    await withView(log, [later], async (view) => {
      const shown = view.page.last('error')?.message;
      assert.match(shown ?? '', /is not a git repository/);
      const made = await tempRepository(later);
      await made.commit('first');
      await view.connection.receive({ type: 'selectTab', root: later });
      assert.strictEqual(view.page.last('commits')?.total, 1);
      assert.strictEqual(view.page.last('clearError')?.message, shown);
      await made.commit('second');
      await waitFor(
        () => view.page.last('commits')?.total === 2,
        'the watcher to see the commit',
      );
    });
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*later failed$/,
      /^git worktree list .* failed: spawn .* ENOENT$/,
    );
  });
});

suite('View upstream', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let upstream: string;

  beforeAll(async () => {
    folder = tempFolder('upstream');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    const [tree] = await repository.resolve('HEAD^{tree}');
    upstream = (
      await repository.git('commit-tree', tree, '-p', 'HEAD~1', '-m', 'pushed')
    ).trim();
    await repository.git('remote', 'add', 'origin', 'https://example.com/x');
    await repository.git('update-ref', 'refs/remotes/origin/main', upstream);
    await repository.git('branch', '--set-upstream-to=origin/main');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('reveals the upstream of the checked-out branch when asked', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'showUpstream',
        root: repository.root,
      });
      assert.strictEqual(view.page.last('reveal')?.hash, upstream);
    });
  });

  test('says why there is no upstream to show', async () => {
    await withView(
      log,
      [repository.root],
      async (view) => {
        await withNotices(view.page, 'info', async (messages) => {
          const ask = () =>
            view.connection.receive({
              type: 'showUpstream',
              root: repository.root,
            });
          await repository.git('branch', '--unset-upstream');
          try {
            await ask();
          } finally {
            await repository.git('branch', '--set-upstream-to=origin/main');
          }
          await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
          try {
            await ask();
          } finally {
            await repository.git(
              'update-ref',
              'refs/remotes/origin/main',
              upstream,
            );
          }
          await repository.git('switch', '-q', '--detach');
          try {
            await ask();
          } finally {
            await repository.git('switch', '-q', 'main');
          }
          await view.connection.receive({
            type: 'setSolo',
            root: repository.root,
            solo: true,
          });
          await ask();
          assert.deepStrictEqual(messages, [
            'main has no upstream',
            "origin/main, the upstream of main, doesn't exist anymore",
            'The checked-out commit is on no branch, so it has no upstream',
            'origin/main is not in the history while Solo shows only that of the checked-out commit',
          ]);
          assert.strictEqual(view.page.last('reveal'), undefined);
        });
      },
      'unwatched',
    );
  });
});

suite('View stashes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let stash: string;

  beforeAll(async () => {
    folder = tempFolder('stash');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'tracked.txt': 'one\n' });
    await repository.commit('b');
    fs.writeFileSync(path.join(repository.root, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await repository.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
    [stash] = await repository.resolve('stash@{0}');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a stash on its base, and its untracked files with its changes', async () => {
    await withView(log, [repository.root], async (view) => {
      const commits = view.page.last('commits');
      assert.deepStrictEqual(
        commits?.commits.map((commit) => commit.subject),
        ['On main: kept aside', 'b', 'a'],
      );
      assert.deepStrictEqual(
        commits.graph.map((row) => row.stash ?? false),
        [true, false, false],
      );
      assert.deepStrictEqual(view.page.last('repository')?.stashes, [
        { name: 'stash@{0}', commit: stash, message: 'On main: kept aside' },
      ]);
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: stash,
      });
      assert.deepStrictEqual(
        view.page.last('files')?.files.map((file) => [file.path, file.status]),
        [
          ['tracked.txt', 'M'],
          ['new.txt', 'U'],
        ],
      );
      assert.match(view.page.last('diff')?.patch ?? '', /^\+new$/m);
    });
  });

  test('leaves the stashes out of the history while solo', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(view.page.last('commits')?.total, 2);
    });
  });

  test('lists the history again once a stash is dropped', async () => {
    await withView(
      log,
      [repository.root],
      async (view) => {
        await repository.git('stash', 'drop', '-q');
        try {
          await view.connection.refresh();
          assert.strictEqual(view.page.last('commits')?.total, 2);
          assert.deepStrictEqual(view.page.last('repository')?.stashes, []);
        } finally {
          await repository.git(
            'stash',
            'store',
            '-q',
            '-m',
            'kept aside',
            stash,
          );
        }
      },
      'unwatched',
    );
  });
});

suite('View staged and unstaged changes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;

  beforeAll(async () => {
    folder = tempFolder('staging');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'both.txt': 'one\n' });
  });

  beforeEach(async () => {
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'two\n');
    await repository.git('add', 'both.txt');
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'three\n');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows all the changes since HEAD first, and the staged and unstaged ones apart, each side read from where it is kept', async () => {
    await withView(log, [repository.root], async (view) => {
      const root = repository.root;
      assert.strictEqual(view.page.last('workingTree')?.files, 1);
      await view.connection.receive({
        type: 'selectCommit',
        root,
        hash: workingTreeHash,
      });
      const files = view.page.last('files');
      assert.deepStrictEqual(
        [
          files?.all?.map((file) => file.path),
          files?.staged?.map((file) => file.path),
          files?.files.map((file) => file.path),
        ],
        [['both.txt'], ['both.txt'], ['both.txt']],
      );
      const all = view.page.last('diff');
      assert.ok(all);
      assert.strictEqual(all.area, undefined);
      assert.match(all.patch, /^-one$/m);
      assert.match(all.patch, /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
        area: 'staged',
      });
      const staged = view.page.last('diff');
      assert.strictEqual(staged?.area, 'staged');
      assert.match(staged.patch, /^\+two$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'staged',
      });
      const blob = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(
        view.page.last('diff')?.patch ?? '',
      )?.[1];
      assert.ok(blob);
      await view.connection.receive({
        type: 'loadTexts',
        root,
        hash: workingTreeHash,
        diff: 0,
        texts: [{ path: 'both.txt', side: 'new', blob }],
      });
      assert.strictEqual(view.page.last('texts')?.texts[0]?.text, 'two\n');
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'unstaged',
      });
      const unstaged = view.page.last('diff');
      assert.deepStrictEqual(
        [unstaged?.path, unstaged?.area],
        ['both.txt', 'unstaged'],
      );
      assert.match(unstaged?.patch ?? '', /^-two$/m);
      assert.match(unstaged?.patch ?? '', /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
      });
      const again = view.page.last('diff');
      assert.ok(again);
      assert.strictEqual(again.area, undefined);
      assert.doesNotMatch(again.patch, /two/);
      assert.match(again.patch, /^\+three$/m);
    });
  });

  test('starts with all the changes while nothing is staged too', async () => {
    await repository.git('restore', '--staged', 'both.txt');
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      assert.deepStrictEqual(view.page.last('files')?.staged, []);
      const diff = view.page.last('diff');
      assert.ok(diff);
      assert.strictEqual(diff.area, undefined);
      assert.match(diff.patch, /^\+three$/m);
    });
  });
});
