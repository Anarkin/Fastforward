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
  reopen,
  rootOf,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool preloading tabs', () => {
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

  test('shows the first rows of a long history of a tab opened while it preloads, before the whole of it is read', async () => {
    await withView(log, [other, repository.root], async (own) => {
      stubMethod(own.view, 'listRecentHistory', (original, ...args) =>
        original(...args.slice(0, 4), 2),
      );
      const held = gate();
      let reading = false;
      stubMethod(own.view, 'listFullHistory', async (original, ...args) => {
        if (rootOf(args[0]) === repository.root) {
          reading = true;
          await held.opened;
        }
        return original(...args);
      });
      const preloading = own.connection.receive({
        type: 'preloadTab',
        tab: tabOf(own.page, repository.root),
      });
      await waitFor(() => reading, 'the preload to read the history');
      own.page.clear();
      const opening = own.connection.receive({
        type: 'selectTab',
        tab: tabOf(own.page, repository.root),
      });
      await waitFor(
        () => own.page.last('commits') !== undefined,
        'the first rows',
      );
      assert.strictEqual(own.page.last('commits')?.total, 2);
      held.open();
      await Promise.all([preloading, opening]);
      assert.strictEqual(own.page.last('commits')?.total, 3);
      assert.strictEqual(
        own.page.last('repository')?.headCommit,
        fixture.merge,
      );
    });
  });

  test('sends the whole history of a tab opened while it preloads to the page loaded again before the preload is done', async () => {
    await withView(log, [other, repository.root], async (own) => {
      const held = gate();
      let reading = false;
      stubMethod(own.view, 'listFullHistory', async (original, ...args) => {
        if (rootOf(args[0]) === repository.root) {
          reading = true;
          await held.opened;
        }
        return original(...args);
      });
      const preloading = own.connection.receive({
        type: 'preloadTab',
        tab: tabOf(own.page, repository.root),
      });
      await waitFor(() => reading, 'the preload to read the history');
      const opening = own.connection.receive({
        type: 'selectTab',
        tab: tabOf(own.page, repository.root),
      });
      own.connection.dispose();
      const reloaded = reopen(own.view);
      await waitFor(
        () => shownTabs(reloaded.page) !== undefined,
        'the page to load again',
      );
      held.open();
      await Promise.all([preloading, opening, reloaded.ready]);
      assert.strictEqual(reloaded.page.last('commits')?.total, 3);
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

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other]);
    });

    afterEach(() => tabs.connection.dispose());

    test('preloads a tab in the background, which then opens as it was left', async () => {
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'preloadTab',
        tab: tabOf(tabs.page, other),
      });
      assert.ok(
        !tabs.page.messages.some(
          (message) =>
            (message.type === 'files' && message.hash === otherHead) ||
            (message.type === 'commits' && message.total === 1),
        ),
      );
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
    });

    test('opens a tab whose preload failed with its history', async () => {
      let failed = false;
      stubMethod(tabs.view, 'sendWorkingTree', async (original, ...args) => {
        const [context] = args;
        if (!failed && rootOf(context) === other) {
          failed = true;
          throw new Error('working tree failed');
        }
        await original(...args);
      });
      await tabs.connection.receive({
        type: 'preloadTab',
        tab: tabOf(tabs.page, other),
      });
      assert.ok(failed);
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      assert.strictEqual(tabs.page.last('files'), undefined);
      takeErrorsLogged(
        logged,
        /^Preloading tab .*other failed$/,
        /^working tree failed$/,
      );
    });

    test('preloads nothing for the shown tab, or one opened before', async () => {
      const preloaded: unknown[] = [];
      stubMethod(tabs.view, 'preload', (original, ...args) => {
        preloaded.push(rootOf(args[1]));
        return original(...args);
      });
      const loaded: unknown[] = [];
      stubMethod(tabs.view, 'loadTab', (original, ...args) => {
        loaded.push(rootOf(args[0]));
        return original(...args);
      });
      await tabs.connection.receive({
        type: 'preloadTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.deepStrictEqual(preloaded, []);
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, other),
      });
      await tabs.connection.receive({
        type: 'selectTab',
        tab: tabOf(tabs.page, repository.root),
      });
      assert.deepStrictEqual(loaded, [other]);
      await tabs.connection.receive({
        type: 'preloadTab',
        tab: tabOf(tabs.page, other),
      });
      assert.deepStrictEqual(preloaded, [other]);
      assert.deepStrictEqual(loaded, [other]);
    });

    test('opens a tab that is preloading once it has loaded, without sending its history again', async () => {
      tabs.page.clear();
      await Promise.all([
        tabs.connection.receive({
          type: 'preloadTab',
          tab: tabOf(tabs.page, other),
        }),
        tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        }),
      ]);
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      assert.strictEqual(tabs.page.last('error'), undefined);
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
    });

    test('shows the bookmarks a preloading tab makes once it opens', async () => {
      await Promise.all([
        tabs.connection.receive({
          type: 'preloadTab',
          tab: tabOf(tabs.page, other),
        }),
        tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        }),
      ]);
      const saved = savedBookmarks(tabs.store, other);
      assert.ok(saved && saved.length > 0);
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, saved);
    });

    test('shows nothing of a preloading tab once another tab is clicked', async () => {
      tabs.page.clear();
      await Promise.all([
        tabs.connection.receive({
          type: 'preloadTab',
          tab: tabOf(tabs.page, other),
        }),
        tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        }),
        tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, repository.root),
        }),
      ]);
      assert.strictEqual(shownTabs(tabs.page)?.active, repository.root);
      assert.ok(
        !tabs.page.messages.some(
          (message) => message.type === 'commits' && message.total === 1,
        ),
      );
    });
  });
});
