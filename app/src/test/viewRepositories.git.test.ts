import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workingTreeHash } from '../shared/protocol';
import { recentKey, sameRoot } from '../storage';
import {
  asIfOwnedByAnother,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  savedBookmarks,
  takeErrorsLogged,
  viewRepositories,
  withNotices,
  withView,
  type ViewRepositories,
} from './viewHarness';

suite('View of other repositories', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];
  let other: string;
  let otherHead: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteSetup(async () => {
    ({ folder, repository, fixture, other, otherHead } =
      await viewRepositories());
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
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

  test('keeps a recent repository git refuses to open, and says what git said', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.store.update(recentKey, [other]);
      await asIfOwnedByAnother(() =>
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
      await asIfOwnedByAnother(() =>
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
      /^selectTab failed$/,
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

  test('says a repository whose folder is removed while open is not a repository', async () => {
    const removed = await tempRepository(path.join(folder, 'removed'));
    await removed.commit('first');
    await withView(
      log,
      [removed.root, repository.root],
      async (view) => {
        assert.strictEqual(view.page.last('error'), undefined);
        await view.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        removeFolder(removed.root);
        await view.connection.receive({
          type: 'selectTab',
          root: removed.root,
        });
        assert.match(
          view.page.last('error')?.message ?? '',
          /is not a git repository/,
        );
      },
      'unwatched',
    );
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*removed failed$/,
      /^selectTab failed$/,
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
});

suite('View upstream', function () {
  this.timeout(30_000);
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let upstream: string;

  suiteSetup(async () => {
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

  suiteTeardown(async () => {
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

suite('View stashes', function () {
  this.timeout(30_000);
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let stash: string;

  suiteSetup(async () => {
    folder = tempFolder('stash');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'tracked.txt': 'one\n' });
    await repository.commit('b');
    fs.writeFileSync(path.join(repository.root, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await repository.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
    [stash] = await repository.resolve('stash@{0}');
  });

  suiteTeardown(async () => {
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

suite('View staged and unstaged changes', function () {
  this.timeout(30_000);
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;

  suiteSetup(async () => {
    folder = tempFolder('staging');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'both.txt': 'one\n' });
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'two\n');
    await repository.git('add', 'both.txt');
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'three\n');
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows the staged and unstaged changes apart, starting with the staged ones, each side read from where it is kept', async () => {
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
          files?.staged?.map((file) => file.path),
          files?.files.map((file) => file.path),
        ],
        [['both.txt'], ['both.txt']],
      );
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
    });
  });

  test('starts with the unstaged changes while nothing is staged', async () => {
    await repository.git('restore', '--staged', 'both.txt');
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      assert.deepStrictEqual(view.page.last('files')?.staged, []);
      const diff = view.page.last('diff');
      assert.strictEqual(diff?.area, 'unstaged');
      assert.match(diff.patch, /^\+three$/m);
    });
  });
});
