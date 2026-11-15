import * as assert from 'node:assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import {
  closeViews,
  openView,
  savedBookmarks,
  type OpenView,
  tabOf,
  shownTabs,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { commitsSent } from '../../../../helpers/fakePage';

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
  });
});
