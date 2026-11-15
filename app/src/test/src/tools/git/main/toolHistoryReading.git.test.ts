import * as assert from 'node:assert';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  gate,
  reopen,
  stubMethod,
  withView,
  shownTabs,
} from '../../../../helpers/harness';
import {
  restoreRepository,
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool reading the history', () => {
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
});
