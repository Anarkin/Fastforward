import * as assert from 'node:assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { soloKey } from '../../../../../tools/git/main/storage';
import type { GitTool } from '../../../../../tools/git/main/tool';
import type { FakeStore } from '../../../../helpers/fakeStore';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  gate,
  openView,
  reopen,
  stubMethod,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import {
  restoreRepository,
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { commitsSent, type FakePage } from '../../../../helpers/fakePage';

suite('Git tool applying Solo', () => {
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

  suite('with its tab open', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('stops reading the history for Solo once it is toggled again, showing only the history asked for last, as the first was read whole and laid out first', async () => {
      const held = gate();
      const signals: AbortSignal[] = [];
      stubMethod(fastforward, 'listFullHistory', async (original, ...args) => {
        const signal = args.find((arg) => arg instanceof AbortSignal);
        assert.ok(signal instanceof AbortSignal);
        signals.push(signal);
        if (signals.length === 1) {
          await Promise.race([
            held.opened,
            new Promise((resolve) => signal.addEventListener('abort', resolve)),
          ]);
        }
        return original(...args);
      });
      page.clear();
      try {
        const on = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(() => signals.length === 1, 'the history to be read');
        const off = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        held.open();
        await Promise.all([on, off]);
        assert.strictEqual(signals[0].aborted, true);
        assert.strictEqual(commitsSent(page.messages), 1);
      } finally {
        await gitState(store).update(soloKey, {});
      }
    });

    test('shows only the history of the checked-out commit when solo, and every branch again after', async () => {
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      await repository.git('branch', 'side', side);
      try {
        await connection.refresh();
        assert.strictEqual(page.last('commits')?.total, 4);
        page.clear();
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        const applying = page.messages.flatMap((message) =>
          message.type === 'applyingSolo' ? [message.running] : [],
        );
        assert.deepStrictEqual(applying, [true, false]);
        assert.ok(
          page.messages.findIndex((message) => message.type === 'commits') <
            page.messages.findLastIndex(
              (message) => message.type === 'applyingSolo',
            ),
        );
        assert.deepStrictEqual(gitState(store).get(soloKey), {
          [repository.root]: true,
        });
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.total, 4);
      } finally {
        await gitState(store).update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });
  });

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other]);
    });

    afterEach(() => tabs.connection.dispose());

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
  });
});
