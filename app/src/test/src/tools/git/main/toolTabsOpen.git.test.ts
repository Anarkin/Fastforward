import { plainOf } from '../../../../../lib/shared/sentences';
import * as assert from 'node:assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { sameRoot } from '../../../../../lib/main/paths';
import { soloKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  gate,
  openView,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  type OpenView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool with two tabs', () => {
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

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other]);
    });

    afterEach(() => tabs.connection.dispose());

    test('comes back to a tab as it was, without reloading its history', async () => {
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
      });
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.deepStrictEqual(tabs.page.last('commits')?.scrollTarget, {
        index: 1,
        offset: 7,
        report: 1,
      });
      assert.ok(tabs.page.last('workingTree'));
    });

    test('reloads the history of a tab whose refs moved while away', async () => {
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      await repository.git('branch', 'moved-away', 'main~1');
      try {
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, repository.root),
        });
        assert.strictEqual(commitsSent(tabs.page.messages), 2);
        const refs = tabs.page.last('repository')?.refs.map((ref) => ref.name);
        assert.ok(refs?.includes('moved-away'));
      } finally {
        await repository.git('branch', '-D', 'moved-away');
      }
    });

    test('reloads other tabs for a changed merge setting when they come back', async () => {
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      await tabs.connection.receive({
        type: 'setCollapseMerges',
        collapse: false,
      });
      assert.strictEqual(
        tabs.settings.settings.tools.git.collapseMerges,
        false,
      );
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.strictEqual(tabs.page.last('commits')?.total, 5);
    });

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

    test('drops what the page asks of a tab it has left, but keeps its bookmarks and place', async () => {
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
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
        report: 1,
      });
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('navigation'), undefined);
      assert.deepStrictEqual(savedBookmarks(tabs.store, repository.root), []);
      assert.deepStrictEqual(savedBookmarks(tabs.store, other), [
        { kind: 'branch', name: 'main' },
      ]);

      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, repository.root),
      });
      const replayed = tabs.page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.deepStrictEqual(replayed?.scrollTarget, {
        index: 1,
        offset: 7,
        report: 1,
      });
      assert.notStrictEqual(tabs.page.last('files')?.hash, fixture.b);
    });

    test('keeps edited bookmarks when a tab opens again', async () => {
      await tabs.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, repository.root),
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
        tab: tabOf(tabs.page, repository.root),
      });
      assert.strictEqual(shownTabs(tabs.page)?.active, other);
      assert.match(
        plainOf(tabs.page.last('error')?.message ?? ''),
        /next tab failed/,
      );
      takeErrorsLogged(logged, /^Showing tab .* failed$/, /^next tab failed$/);
    });

    test('solos, closes and opens tabs though the state fails to be written', async () => {
      tabs.store.update = (key, value) => {
        tabs.store.values.set(key, value);
        return Promise.reject(new Error('state not written'));
      };
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(tabs.page.last('solo')?.solo, true);
      await tabs.connection.receive({
        type: 'closeTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.strictEqual(shownTabs(tabs.page)?.active, other);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      await tabs.connection.receive({
        type: 'openRepository',
        root: repository.root,
      });
      assert.strictEqual(shownTabs(tabs.page)?.active, repository.root);
      assert.strictEqual(tabs.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^state not written$/,
      );
    });

    test('keeps the shown tab when another one closes', async () => {
      await tabs.connection.receive({
        type: 'closeTab',
        tab: tabOf(tabs.page, other),
      });
      const left = shownTabs(tabs.page);
      assert.strictEqual(left?.active, repository.root);
      assert.ok(!left.tabs.some((tab) => sameRoot(tab.root, other)));
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
          tab: tabOf(tabs.page, repository.root),
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
        await gitState(tabs.store).update(soloKey, {});
      }
    });
  });
});
