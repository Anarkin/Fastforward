import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { sameRoot } from '../../../../../lib/main/paths';
import { waitFor } from '../../../../helpers/fixtures';
import {
  asIfOwnedByAnother,
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gate,
  openView,
  rootOf,
  stubMethod,
  takeErrorsLogged,
  withNotices,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool with tabs that fail', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];
  let other: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture, other } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows no error of the tab the page opens as it loads that failed after it was left', async () => {
    await withView(
      log,
      [repository.root, other],
      async (own) => {
        const load = failingLoad(own, repository.root);
        const ready = own.connection.receive({ type: 'ready' });
        await waitFor(load.loading, 'the tab to load');
        await own.connection.receive({
          type: 'selectTab',
          tab: tabOf(own.page, other),
        });
        own.page.clear();
        load.fail();
        await ready;
        assert.strictEqual(own.page.last('error'), undefined);
      },
      false,
    );
    takeErrorsLogged(logged, /^Showing tab .* failed$/, /^loading failed$/);
  });

  test('shows no error of the tab opened after one is closed that failed after it was left', async () => {
    const third = await tempRepository(path.join(folder, 'after-closed'));
    await third.commit('third');
    await withView(log, [other, repository.root, third.root], async (own) => {
      const load = failingLoad(own, repository.root);
      const closing = own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, other),
      });
      await waitFor(load.loading, 'the next tab to load');
      await own.connection.receive({
        type: 'selectTab',
        tab: tabOf(own.page, third.root),
      });
      own.page.clear();
      load.fail();
      await closing;
      assert.strictEqual(own.page.last('error'), undefined);
    });
    takeErrorsLogged(logged, /^Showing tab .* failed$/, /^loading failed$/);
  });

  test('shows no error of the tab of a repository picked that failed after it was left', async () => {
    const host = new FakeHost();
    host.folders = [other];
    await withView(
      log,
      [repository.root],
      async (own) => {
        const load = failingLoad(own, other);
        const browsing = own.connection.receive({ type: 'browseRepositories' });
        await waitFor(load.loading, 'the tab picked to load');
        await own.connection.receive({
          type: 'selectTab',
          tab: tabOf(own.page, repository.root),
        });
        own.page.clear();
        load.fail();
        await browsing;
        assert.strictEqual(own.page.last('error'), undefined);
      },
      true,
      host,
    );
    takeErrorsLogged(logged, /^Showing tab .* failed$/, /^loading failed$/);
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

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other]);
    });

    afterEach(() => tabs.connection.dispose());

    test("shows no error of a tab's request that failed after it was left", async () => {
      await tabs.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      const held = gate();
      let loadingTree = false;
      stubMethod(tabs.view, 'sendTree', async () => {
        loadingTree = true;
        await held.opened;
        throw new Error('tree failed');
      });
      const loading = tabs.connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.merge,
      });
      await waitFor(() => loadingTree, 'the tree to load');
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      tabs.page.clear();
      held.open();
      await loading;
      assert.strictEqual(tabs.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Handling loadTree from the page failed$/,
        /^tree failed$/,
      );
    });

    test('shows the error of opening the next tab after one is closed', async () => {
      stubMethod(tabs.view, 'loadTab', () =>
        Promise.reject(new Error('next tab failed')),
      );
      await tabs.connection.receive({
        type: 'closeTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.strictEqual(shownTabs(tabs.page)?.active, other);
      assert.match(
        plainOf(tabs.page.last('error')?.message ?? ''),
        /next tab failed/,
      );
      takeErrorsLogged(logged, /^Showing tab .* failed$/, /^next tab failed$/);
    });
  });
});

function failingLoad(
  own: OpenView,
  root: string,
): { loading: () => boolean; fail: () => void } {
  const held = gate();
  let loading = false;
  stubMethod(own.view, 'loadTab', async (original, ...args) => {
    if (!sameRoot(rootOf(args[0]) ?? '', root)) {
      return original(...args);
    }
    loading = true;
    await held.opened;
    throw new Error('loading failed');
  });
  return { loading: () => loading, fail: held.open };
}
