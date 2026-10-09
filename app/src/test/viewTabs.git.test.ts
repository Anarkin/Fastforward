import * as assert from 'node:assert';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { sameRoot, soloKey } from '../storage';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  gate,
  openView,
  rootOf,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withView,
  type OpenView,
  type ViewRepositories,
} from './viewHarness';

suite('View with two tabs', function () {
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

  test('opens the tab before the shown one when that closes last in the list', async () => {
    const last = await tempRepository(path.join(folder, 'last'));
    await last.commit('last');
    await withView(log, [repository.root, other, last.root], async (own) => {
      await own.connection.receive({ type: 'selectTab', root: last.root });
      await own.connection.receive({ type: 'closeTab', root: last.root });
      assert.strictEqual(own.page.last('tabs')?.active, other);
    });
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
      takeErrorsLogged(
        logged,
        /^fetch failed$/,
        /^git fetch --all --prune --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  suite('open', () => {
    let tabs: OpenView;

    setup(async () => {
      tabs = await openView(log, [repository.root, other], 'unwatched');
    });

    teardown(() => tabs.connection.dispose());

    test('comes back to a tab as it was, without reloading its history', async () => {
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
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
        report: 1,
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
        if (!failed && rootOf(context) === other) {
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
      takeErrorsLogged(
        logged,
        /^Preloading tab .*other failed$/,
        /^working tree failed$/,
      );
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
      await tabs.connection.receive({ type: 'selectTab', root: other });
      tabs.page.clear();
      held.open();
      await loading;
      assert.strictEqual(tabs.page.last('error'), undefined);
      takeErrorsLogged(logged, /^loadTree failed$/, /^tree failed$/);
    });

    test('preloads nothing for the shown tab, or one opened before', async () => {
      const preloaded: unknown[] = [];
      stubMethod(tabs.view, 'preload', (original, ...args) => {
        preloaded.push(args[1]);
        return original(...args);
      });
      const loaded: unknown[] = [];
      stubMethod(tabs.view, 'loadTab', (original, ...args) => {
        loaded.push(rootOf(args[0]));
        return original(...args);
      });
      await tabs.connection.receive({
        type: 'preloadTab',
        root: repository.root,
      });
      assert.deepStrictEqual(preloaded, []);
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.deepStrictEqual(loaded, [other]);
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      assert.deepStrictEqual(preloaded, [other]);
      assert.deepStrictEqual(loaded, [other]);
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

    test('shows the bookmarks a preloading tab makes once it opens', async () => {
      await Promise.all([
        tabs.connection.receive({ type: 'preloadTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: other }),
      ]);
      const saved = savedBookmarks(tabs.store, other);
      assert.ok(saved && saved.length > 0);
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, saved);
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
        root: repository.root,
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
      takeErrorsLogged(logged, /^closeTab failed$/, /^next tab failed$/);
    });

    test('sorts, solos, closes and opens tabs though the state fails to be written', async () => {
      tabs.store.update = (key, value) => {
        tabs.store.values.set(key, value);
        return Promise.reject(new Error('state not written'));
      };
      tabs.page.clear();
      await tabs.connection.receive({ type: 'sortTabs' });
      assert.ok(tabs.page.last('tabs'));
      await tabs.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(tabs.page.last('solo')?.solo, true);
      await tabs.connection.receive({
        type: 'closeTab',
        root: repository.root,
      });
      assert.strictEqual(tabs.page.last('tabs')?.active, other);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      await tabs.connection.receive({
        type: 'openRepository',
        root: repository.root,
      });
      assert.strictEqual(tabs.page.last('tabs')?.active, repository.root);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^closeTab failed$/,
        /^state not written$/,
      );
    });

    test('keeps the shown tab when another one closes', async () => {
      await tabs.connection.receive({ type: 'closeTab', root: other });
      const left = tabs.page.last('tabs');
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
  });
});
