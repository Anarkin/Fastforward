import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { plainOf, strings } from '../../../../../../lib/shared/strings';
import { sameRoot } from '../../../../../../shell/main/storage';
import { recentKey } from '../../../../../../tools/git/main/storage';
import {
  asIfOwnedByAnother,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { waitFor } from '../../../../../helpers/fixtures';
import { recordingLog } from '../../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  savedBookmarks,
  takeErrorsLogged,
  withNotices,
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../../helpers/harness';
import { viewRepositories } from '../../../../../helpers/gitFixtures';
import { keptOf, keepAll } from './otherRepositoriesFixtures';

suite('Git tool of other repositories', () => {
  let folder: string;
  let repository: TempRepository;
  let other: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, other } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
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
        const shown = shownTabs(view.page);
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
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
      assert.strictEqual(view.page.last('notice'), undefined);
    });
  });

  test('offers as many recent repositories not open in a tab as the settings say, telling the page again once they change', async () => {
    await withView(log, [repository.root], async (view) => {
      const older = Array.from({ length: 19 }, (_, index) =>
        path.join(folder, `older-${index}`),
      );
      await gitState(view.store).update(recentKey, [repository.root, ...older]);
      await view.connection.receive({
        type: 'forgetRecent',
        root: path.join(folder, 'never-recent'),
      });
      assert.deepStrictEqual(
        shownTabs(view.page)?.recent.map((recent) => recent.root),
        older.slice(0, 15),
      );
      await view.settings.setTabs('recentFolders', 2);
      view.shell.reloadSettings();
      assert.deepStrictEqual(
        shownTabs(view.page)?.recent.map((recent) => recent.root),
        older.slice(0, 2),
      );
    });
  });

  test('offers the recent repositories that are not open in a tab, counting only those towards how many it offers', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, [other, repository.root]);
      await view.connection.receive({
        type: 'forgetRecent',
        root: path.join(folder, 'never-recent'),
      });
      assert.deepStrictEqual(shownTabs(view.page)?.recent, [
        { root: other, name: 'other' },
      ]);
      const older = Array.from({ length: 19 }, (_, index) =>
        path.join(folder, `older-${index}`),
      );
      await gitState(view.store).update(recentKey, [
        repository.root,
        ...older,
        other,
      ]);
      await view.connection.receive({ type: 'openRepository', root: other });
      const shown = shownTabs(view.page);
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.deepStrictEqual(
        shown.recent.map((recent) => recent.root),
        older.slice(0, 15),
      );
    });
  });

  test('opens only the recent repositories the page names', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, []);
      await view.connection.receive({ type: 'openRepository', root: other });
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), []);
    });
  });

  test('forgets a recent folder that is no longer a repository, and says so', async () => {
    const gone = tempFolder('gone');
    try {
      await withView(log, [repository.root], async (view) => {
        await gitState(view.store).update(recentKey, [gone, other]);
        await view.connection.receive({ type: 'openRepository', root: gone });
        assert.match(
          plainOf(view.page.last('notice')?.message ?? ''),
          /is not in a git repository$/,
        );
        assert.deepStrictEqual(gitState(view.store).get(recentKey), [other]);
        assert.deepStrictEqual(
          shownTabs(view.page)?.tabs.map((tab) => tab.name),
          ['main'],
        );
      });
    } finally {
      removeFolder(gone);
    }
  });

  test('keeps a recent repository whose folder cannot be reached, with its bookmarks and all else kept of it, saying so, as an unplugged drive or a share offline comes back', async () => {
    const unplugged = path.join(folder, 'unplugged', 'repository');
    await withView(log, [repository.root], async (view) => {
      await keepAll(view.store, [repository.root, unplugged]);
      await gitState(view.store).update(recentKey, [unplugged, other]);
      await view.connection.receive({
        type: 'openRepository',
        root: unplugged,
      });

      assert.deepStrictEqual(
        view.page.last('notice')?.message,
        strings.messages.couldNotOpen(unplugged, strings.messages.unreachable),
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [
        unplugged,
        other,
      ]);
      assert.ok(
        keptOf(view.store).every((roots) => roots.includes(unplugged)),
        JSON.stringify(keptOf(view.store)),
      );
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
    });
  });

  test('keeps a recent repository git refuses to open, and says what git said', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, [other]);
      await asIfOwnedByAnother(other, () =>
        view.connection.receive({ type: 'openRepository', root: other }),
      );
      assert.match(
        plainOf(view.page.last('notice')?.message ?? ''),
        /^Couldn't open ".*other"\. fatal: detected dubious ownership/,
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [other]);
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
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
    await withView(
      log,
      [repository.root, other],
      async (view) => {
        await asIfOwnedByAnother(other, () =>
          view.connection.receive({
            type: 'selectTab',
            tab: tabOf(view.page, other),
          }),
        );
        assert.match(
          plainOf(view.page.last('error')?.message ?? ''),
          /^fatal: detected dubious ownership/,
        );
      },
      { watched: true },
    );
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*other failed$/,
      /^Showing tab .* failed$/,
      /^git .* failed: fatal: detected dubious ownership/,
    );
  });

  test('opens a tab git refused to open once it is clicked again, or its worktree is, after git no longer refuses it', async () => {
    await withView(
      log,
      [repository.root, other],
      async (view) => {
        for (const again of [
          () =>
            view.connection.receive({
              type: 'selectTab',
              tab: tabOf(view.page, other),
            }),
          () =>
            view.connection.receive({ type: 'selectWorktree', root: other }),
        ]) {
          await asIfOwnedByAnother(other, () =>
            view.connection.receive({
              type: 'selectTab',
              tab: tabOf(view.page, other),
            }),
          );
          view.page.clear();
          await again();
          assert.ok(view.page.last('repository'), String(again));
          await view.connection.receive({
            type: 'selectTab',
            tab: tabOf(view.page, repository.root),
          });
        }
      },
      { watched: true },
    );
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*other failed$/,
      /^Showing tab .* failed$/,
      /^git .* failed: fatal: detected dubious ownership/,
    );
  });

  test('closes the only tab, leaving none shown but offering it again', async () => {
    await withView(log, [repository.root], async (view) => {
      for (const tab of shownTabs(view.page)?.tabs ?? []) {
        await view.connection.receive({
          type: 'closeTab',
          tab: tabOf(view.page, tab.root),
        });
      }
      assert.deepStrictEqual(shownTabs(view.page), {
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
    await withView(
      log,
      [removed.root, repository.root],
      async (view) => {
        assert.strictEqual(view.page.last('error'), undefined);
        await view.connection.receive({
          type: 'selectTab',
          tab: tabOf(view.page, repository.root),
        });
        removeFolder(removed.root);
        await withNotices(view.page, 'error', async (notices) => {
          await view.connection.receive({
            type: 'selectTab',
            tab: tabOf(view.page, removed.root),
          });
          assert.deepStrictEqual(notices, []);
        });
        assert.match(
          plainOf(view.page.last('error')?.message ?? ''),
          /is not a git repository/,
        );
      },
      { watched: true },
    );
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*removed failed$/,
      /^Showing tab .* failed$/,
      /^git .* failed: spawn .* ENOENT$/,
    );
  });

  test('makes the main branch a bookmark once a repository opened without commits has one', async () => {
    const empty = await tempRepository(path.join(folder, 'unborn'));
    await withView(log, [empty.root], async (view) => {
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, []);
      await empty.commit('first');
      await view.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, [
        { kind: 'branch', name: 'main' },
      ]);
      assert.deepStrictEqual(savedBookmarks(view.store, empty.root), [
        { kind: 'branch', name: 'main' },
      ]);
    });
  });

  test('says nothing of a tab that fails to preload until it is opened', async () => {
    const plain = path.join(folder, 'plain');
    fs.mkdirSync(plain);
    await withView(log, [repository.root, plain], async (view) => {
      view.page.clear();
      await view.connection.receive({
        type: 'preloadTab',
        tab: tabOf(view.page, plain),
      });
      assert.strictEqual(view.page.last('error'), undefined);
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, plain),
      });
      assert.match(
        plainOf(view.page.last('error')?.message ?? ''),
        /is not a git repository/,
      );
    });
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*plain failed$/,
      /^git worktree list .* failed: fatal: not a git repository/,
    );
  });

  test('says the folder of a tab is no repository once its .git is deleted while it is open, rather than what git said', async () => {
    const unmade = await tempRepository(path.join(folder, 'unmade'));
    await unmade.commit('first');
    await withView(log, [unmade.root], async (view) => {
      fs.rmSync(path.join(unmade.root, '.git'), {
        recursive: true,
        force: true,
        maxRetries: 10,
      });
      view.page.clear();
      await view.connection.refresh();
      assert.deepStrictEqual(
        view.page.last('error')?.message,
        strings.messages.notRepository(unmade.root),
      );
    });
    takeErrorsLogged(logged, /^Refreshing the tab failed$/, /^git .* failed: /);
  });

  test('opens the tab shown again when it is clicked once its folder, missing as it opened, is a repository', async () => {
    const later = path.join(folder, 'later');
    await withView(
      log,
      [later],
      async (view) => {
        const shown = view.page.last('error')?.message;
        assert.match(plainOf(shown ?? ''), /is not a git repository/);
        const made = await tempRepository(later);
        await made.commit('first');
        await view.connection.receive({
          type: 'selectTab',
          tab: tabOf(view.page, later),
        });
        assert.strictEqual(view.page.last('commits')?.total, 1);
        assert.deepStrictEqual(view.page.last('clearError')?.message, shown);
        await made.commit('second');
        await waitFor(
          () => view.page.last('commits')?.total === 2,
          'the watcher to see the commit',
        );
      },
      { watched: true },
    );
    takeErrorsLogged(
      logged,
      /^Listing the worktrees of .*later failed$/,
      /^git worktree list .* failed: spawn .* ENOENT$/,
    );
  });
});
