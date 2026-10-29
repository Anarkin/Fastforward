import * as assert from 'node:assert';
import { createServer } from 'node:http';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../builtins';
import { sameRoot, tabsKey } from '../../../../../shell/main/storage';
import { soloKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  gate,
  openView,
  reopen,
  rootOf,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withView,
  type OpenView,
  type ViewRepositories,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../harness';

function savedRoots(view: OpenView): unknown[] {
  const saved = view.store.values.get(tabsKey);
  return Array.isArray(saved) ? saved.map(rootOf) : [];
}

suite('Git tool with two tabs', () => {
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

  test('sorts the tabs at once when sorting automatically is turned on, and keeps them sorted as repositories open, saving the setting', async () => {
    const zeta = await tempRepository(path.join(folder, 'Zeta'));
    await zeta.commit('zeta');
    const beta = await tempRepository(path.join(folder, 'beta'));
    await beta.commit('beta');
    const host = new FakeHost();
    await withView(
      log,
      [zeta.root, other],
      async (own) => {
        const names = () =>
          (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
        const open = async (root: string) => {
          host.folders = [root];
          await own.connection.receive({ type: 'browseRepositories' });
        };
        await own.connection.receive({ type: 'setAutoSortTabs', on: true });
        assert.deepStrictEqual(names(), ['other', 'Zeta']);
        assert.strictEqual(own.settings.settings.autoSortTabs, true);
        await open(beta.root);
        assert.deepStrictEqual(names(), ['beta', 'other', 'Zeta']);
        await own.connection.receive({ type: 'setAutoSortTabs', on: false });
        await open(repository.root);
        assert.deepStrictEqual(names(), ['beta', 'other', 'Zeta', 'main']);
      },
      true,
      host,
    );
  });

  test('sorts tabs by name and closes one, opening the next', async () => {
    const zeta = await tempRepository(path.join(folder, 'Zeta'));
    await zeta.commit('zeta');
    const twin = await tempRepository(path.join(folder, 'a', 'main'));
    await twin.commit('twin');
    const tabs = [other, zeta.root, repository.root, twin.root];
    await withView(log, tabs, async (own) => {
      const names = () =>
        (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
      await own.connection.receive({ type: 'sortTabs' });
      assert.deepStrictEqual(
        shownTabs(own.page)?.tabs.map((tab) => tab.folder),
        ['a', path.basename(folder), undefined, undefined],
      );
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, twin.root),
      });
      assert.deepStrictEqual(names(), ['main', 'other', 'Zeta']);
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, other),
      });
      const left = shownTabs(own.page);
      assert.deepStrictEqual(names(), ['main', 'Zeta']);
      assert.strictEqual(left?.active, zeta.root);
    });
  });

  test('moves a tab where it is dropped, keeping the open one open, and saves the order', async () => {
    const moved = await tempRepository(path.join(folder, 'Moved'));
    await moved.commit('moved');
    await withView(log, [repository.root, other, moved.root], async (own) => {
      const names = () =>
        (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
      await own.connection.receive({
        type: 'moveTab',
        tab: tabOf(own.page, moved.root),
        index: 0,
      });
      assert.deepStrictEqual(names(), ['Moved', 'main', 'other']);
      assert.strictEqual(shownTabs(own.page)?.active, repository.root);
      assert.deepStrictEqual(savedRoots(own), [
        moved.root,
        repository.root,
        other,
      ]);
      await own.connection.receive({
        type: 'moveTab',
        tab: tabOf(own.page, moved.root),
        index: 2,
      });
      assert.deepStrictEqual(names(), ['main', 'other', 'Moved']);
    });
  });

  test('moves no tab while sorting automatically, nor one not open, nor to a place not in the row, sending the order as it stands so the page drops the one it showed', async () => {
    await withView(log, [repository.root, other], async (own) => {
      const roots = () => shownTabs(own.page)?.tabs.map((tab) => tab.root);
      for (const [tab, index] of [
        ['nowhere', 0],
        [tabOf(own.page, other), -1],
        [tabOf(own.page, other), 2],
        [tabOf(own.page, other), 0.5],
        [tabOf(own.page, other), Number.NaN],
      ] as const) {
        own.page.clear();
        await own.connection.receive({ type: 'moveTab', tab, index });
        assert.deepStrictEqual(roots(), [repository.root, other]);
      }
      await own.connection.receive({ type: 'setAutoSortTabs', on: true });
      own.page.clear();
      await own.connection.receive({
        type: 'moveTab',
        tab: tabOf(own.page, other),
        index: 0,
      });
      assert.deepStrictEqual(roots(), [repository.root, other]);
      assert.deepStrictEqual(savedRoots(own), [repository.root, other]);
    });
  });

  test('stops reading the history of a tab closed while it reads it, as reading a large one takes seconds', async () => {
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let reading: ReturnType<typeof spawn> | undefined;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (
          args.includes('--parents') &&
          !args.some((arg) => arg.startsWith('--max-count')) &&
          reading === undefined
        ) {
          reading = spawn(
            process.execPath,
            ['-e', 'setTimeout(() => {}, 30000)'],
            options,
          );
          return reading;
        }
        return spawn(command, args, options);
      },
    );
    try {
      await withView(
        log,
        [other, repository.root],
        async (own) => {
          const ready = own.connection.receive({ type: 'ready' });
          await waitFor(() => reading !== undefined, 'the history to be read');
          await own.connection.receive({
            type: 'closeTab',
            tab: tabOf(own.page, other),
          });
          await waitFor(
            () => reading?.exitCode !== null || reading.signalCode !== null,
            'the read to stop',
          );
          await ready;
        },
        false,
      );
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('opens the tab before the shown one when that closes last in the list', async () => {
    const last = await tempRepository(path.join(folder, 'last'));
    await last.commit('last');
    await withView(log, [repository.root, other, last.root], async (own) => {
      await own.connection.receive({
        type: 'selectTab',
        tab: tabOf(own.page, last.root),
      });
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, last.root),
      });
      assert.strictEqual(shownTabs(own.page)?.active, other);
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
        await own.connection.receive({
          type: 'closeTab',
          tab: tabOf(own.page, slow.root),
        });
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
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false fetch --progress --all --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('shows the first rows of a long history of a tab opened while it preloads, before the whole of it is read', async () => {
    await withView(
      log,
      [other, repository.root],
      async (own) => {
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
      },
      'unwatched',
    );
  });

  test('sends the whole history of a tab opened while it preloads to the page loaded again before the preload is done', async () => {
    await withView(
      log,
      [other, repository.root],
      async (own) => {
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
      },
      'unwatched',
    );
  });

  test('shows no error of the tab the page opens as it loads that failed after it was left', async () => {
    await withView(
      log,
      [repository.root, other],
      async (own) => {
        stubMethod(own.view, 'watch', () => Promise.resolve());
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
    await withView(
      log,
      [other, repository.root, third.root],
      async (own) => {
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
      },
      'unwatched',
    );
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
      'unwatched',
      host,
    );
    takeErrorsLogged(logged, /^Showing tab .* failed$/, /^loading failed$/);
  });

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other], 'unwatched');
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
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        });
        assert.strictEqual(shownTabs(tabs.page)?.active, other);
        assert.notStrictEqual(spinning(), true);

        tabs.page.clear();
        const back = tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, repository.root),
        });
        await waitFor(() => spinning() === true, 'the spin shown again');

        held.open();
        await Promise.all([applying, back]);
        assert.strictEqual(spinning(), false);
      } finally {
        held.open();
        await gitState(tabs.store).update(soloKey, {});
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
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        });
        tabs.page.clear();
        held.open();
        await applying;
        assert.strictEqual(tabs.page.last('applyingSolo'), undefined);
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, repository.root),
        });
        assert.strictEqual(tabs.page.last('applyingSolo')?.running, false);
      } finally {
        held.open();
        await gitState(tabs.store).update(soloKey, {});
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
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        });
        await tabs.connection.receive({
          type: 'setSolo',
          root: other,
          solo: true,
        });
        assert.strictEqual(tabs.page.last('solo')?.solo, true);
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, repository.root),
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
        await tabs.connection.receive({
          type: 'selectTab',
          tab: tabOf(tabs.page, other),
        });
        assert.strictEqual(tabs.page.last('solo')?.solo, true);
      } finally {
        await gitState(tabs.store).update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });

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
      assert.match(tabs.page.last('error')?.message ?? '', /next tab failed/);
      takeErrorsLogged(logged, /^Showing tab .* failed$/, /^next tab failed$/);
    });

    test('sorts, solos, closes and opens tabs though the state fails to be written', async () => {
      tabs.store.update = (key, value) => {
        tabs.store.values.set(key, value);
        return Promise.reject(new Error('state not written'));
      };
      tabs.page.clear();
      await tabs.connection.receive({ type: 'sortTabs' });
      assert.ok(shownTabs(tabs.page));
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
