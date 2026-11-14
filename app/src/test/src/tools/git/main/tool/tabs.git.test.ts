import * as assert from 'node:assert';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../../helpers/builtins';
import { sameRoot, tabsKey } from '../../../../../../shell/main/storage';
import { waitFor } from '../../../../../helpers/fixtures';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gate,
  reopen,
  rootOf,
  stubMethod,
  takeErrorsLogged,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
} from '../../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../../helpers/gitFixtures';

function savedRoots(view: OpenView): unknown[] {
  const saved = view.store.values.get(tabsKey);
  return Array.isArray(saved) ? saved.map(rootOf) : [];
}

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

  test('names tabs of folders with the same name after the folders they are in, and closes one, opening the next', async () => {
    const zeta = await tempRepository(path.join(folder, 'Zeta'));
    await zeta.commit('zeta');
    const twin = await tempRepository(path.join(folder, 'a', 'main'));
    await twin.commit('twin');
    const tabs = [other, zeta.root, repository.root, twin.root];
    await withView(log, tabs, async (own) => {
      const names = () =>
        (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
      assert.deepStrictEqual(
        shownTabs(own.page)?.tabs.map((tab) => tab.folder),
        [undefined, undefined, path.basename(folder), 'a'],
      );
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, twin.root),
      });
      assert.deepStrictEqual(names(), ['other', 'Zeta', 'main']);
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, other),
      });
      const left = shownTabs(own.page);
      assert.deepStrictEqual(names(), ['Zeta', 'main']);
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

  test('moves no tab not open, nor to a place not in the row, sending the order as it stands so the page drops the one it showed', async () => {
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

  test('goes back to the tab shown before when the shown one closes, rather than to the one next to it', async () => {
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
      assert.strictEqual(shownTabs(own.page)?.active, repository.root);
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
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false fetch --progress --no-auto-maintenance --all --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
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
