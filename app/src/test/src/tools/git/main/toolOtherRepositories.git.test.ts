import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { sameRoot } from '../../../../../shell/main/storage';
import { recentKey } from '../../../../../tools/git/main/storage';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  gate,
  reopen,
  stubMethod,
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import {
  restoreRepository,
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { keptOf, keepAll } from './toolOtherRepositoriesFixtures';

suite('Git tool of other repositories', () => {
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
        await view.settings.setIn('git', 'collapseMerges', false);
        await reload();
        assert.strictEqual(reads, 0);
        assert.notStrictEqual(
          view.page.last('commits')?.graph[0]?.merge,
          'collapsed',
        );
        await view.settings.setIn('git', 'solo', true);
        await reload();
        assert.strictEqual(reads, 1);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        await view.settings.setIn('git', 'collapseMerges', true);
        await view.settings.setIn('git', 'solo', false);
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
      await view.settings.setIn('git', 'collapseMerges', false);
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
          await view.settings.setIn('git', 'solo', true);
          view.view.reloadSettings();
          view.connection.dispose();
          const reloaded = reopen(view.view);
          await waitFor(
            () => shownTabs(reloaded.page) !== undefined,
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
      await withView(log, [repository.root], async (view) => {
        assert.strictEqual(view.page.last('commits')?.total, 4);
        const held = gate();
        let extending = false;
        stubMethod(view.view, 'extendedHistory', async (original, ...args) => {
          const extended = await original(...args);
          extending = true;
          await held.opened;
          return extended;
        });
        await repository.commit('c');
        const [c] = await repository.resolve('main');
        const refreshing = view.connection.refresh();
        await waitFor(() => extending, 'the history to be extended');
        await view.settings.setIn('git', 'solo', true);
        view.view.reloadSettings();
        view.connection.dispose();
        const reloaded = reopen(view.view);
        await waitFor(
          () => shownTabs(reloaded.page) !== undefined,
          'the page to load again',
        );
        held.open();
        await Promise.all([refreshing, reloaded.ready]);
        const shown = reloaded.page.last('commits');
        assert.strictEqual(shown?.total, 4);
        assert.strictEqual(shown.commits[0]?.hash, c);
      });
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
        const shown = shownTabs(view.page);
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['main', 'third', 'other'],
        );
        assert.ok(shown.active && sameRoot(shown.active, other));
        assert.strictEqual(view.page.last('repository')?.headCommit, otherHead);
        const recent = gitState(view.store).get(recentKey);
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
      await gitState(view.store).update(recentKey, [gone, repository.root]);
      await view.connection.receive({ type: 'forgetRecent', root: gone });
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [
        repository.root,
      ]);
      assert.ok(
        shownTabs(view.page)?.recent.every(
          (shown) => !sameRoot(shown.root, gone),
        ),
      );
    });
  });

  test('forgets the bookmarks, remote tags, last fetch and solo of a repository once it is neither recent nor in a tab, keeping those of one only closed', async () => {
    await withView(log, [repository.root, other], async (view) => {
      await keepAll(view.store, [repository.root, other]);
      await gitState(view.store).update(recentKey, [repository.root, other]);
      await view.connection.receive({
        type: 'closeTab',
        tab: tabOf(view.page, other),
      });
      const closed = keptOf(view.store);
      assert.ok(
        closed.every(
          (roots) => roots.includes(other) && roots.includes(repository.root),
        ),
        JSON.stringify(closed),
      );
      await view.connection.receive({ type: 'forgetRecent', root: other });
      const forgotten = keptOf(view.store);
      assert.ok(
        forgotten.every(
          (roots) => !roots.includes(other) && roots.includes(repository.root),
        ),
        JSON.stringify(forgotten),
      );
    });
  });

  test('forgets what it keeps of a repository pushed out of the recent ones by another, but not of one in a tab', async () => {
    await withView(
      log,
      [repository.root],
      async (view) => {
        const older = Array.from({ length: 48 }, (_, index) =>
          path.join(folder, `pushed-${index}`),
        );
        const pushedOut = path.join(folder, 'pushed-out');
        await keepAll(view.store, [pushedOut, other]);
        await gitState(view.store).update(recentKey, [
          ...older,
          other,
          pushedOut,
        ]);
        await view.connection.receive({ type: 'ready' });
        const kept = keptOf(view.store);
        assert.ok(
          kept.every(
            (roots) => roots.includes(other) && !roots.includes(pushedOut),
          ),
          JSON.stringify(kept),
        );
      },
      false,
    );
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
            const shown = shownTabs(reloaded.page);
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
        true,
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
});
