import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { shortHash } from '../../../../../tools/git/shared/hashes';
import { recentKey, worktreesKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  gate,
  idleOnlyOnceOpened,
  openView,
  reopen,
  stubMethod,
  takeErrorsLogged,
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import {
  sameRealFolder,
  worktreesOf,
  worktreeRoot,
} from './toolWorktreesFixtures';

suite('Git tool of worktrees', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let feature: string;
  let review: string;
  let other: string;
  let reviewHead: string;

  beforeAll(async () => {
    folder = tempFolder('worktree-view');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    feature = path.join(folder, 'app.worktrees', 'feature');
    review = path.join(folder, 'app.worktrees', 'review');
    const gone = path.join(folder, 'app.worktrees', 'gone');
    await repository.git('worktree', 'add', '-q', '-b', 'feature', feature);
    await repository.git('-C', feature, 'commit', '--allow-empty', '-m', 'f');
    await repository.git('worktree', 'add', '-q', '--detach', review, 'HEAD~1');
    await repository.git('worktree', 'add', '-q', '-b', 'gone', gone);
    fs.rmSync(gone, { recursive: true, force: true });
    [reviewHead] = await repository.resolve('main~1');
    const second = await tempRepository(path.join(folder, 'other'));
    await second.commit('other');
    other = second.root;
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('is idle only once it has listed the worktrees again for a change its watcher saw', async () => {
    const own = await tempRepository(path.join(folder, 'idle'));
    await own.commit('a');
    const opened = await openView(log, [own.root], { watched: true });
    const held = gate();
    let listing = false;
    stubMethod(opened.view, 'loadWorktrees', async (original, ...args) => {
      listing = true;
      await held.opened;
      return original(...args);
    });
    stubMethod(opened.view, 'refresh', () => Promise.resolve());
    try {
      await own.git('switch', '-q', '-c', 'switched');
      await waitFor(() => listing, 'the worktrees to be listed again');
      opened.connection.dispose();
      await idleOnlyOnceOpened(opened.view, held);
    } finally {
      opened.connection.dispose();
    }
  });

  test('shows the worktrees as listed last though a listing begun before ends after it, as one begun while git removed a worktree went on showing it', async () => {
    const own = await tempRepository(path.join(folder, 'relisted'));
    await own.commit('a');
    const linked = path.join(folder, 'relisted.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '--detach', linked);
    const opened = await openView(log, [own.root], { watched: true });
    const held = gate();
    let listings = 0;
    let firstListed = false;
    stubMethod(opened.view, 'listedWorktrees', async (original, ...args) => {
      const listed = await original(...args);
      if (listings++ === 0) {
        firstListed = true;
        await held.opened;
      }
      return listed;
    });
    stubMethod(opened.view, 'refresh', () => Promise.resolve());
    try {
      assert.strictEqual(worktreesOf(opened).length, 2);
      await own.git('-C', linked, 'switch', '-q', '-c', 'switched');
      await waitFor(() => firstListed, 'the worktrees to be listed');
      await own.git('worktree', 'remove', '--force', linked);
      await waitFor(
        () => worktreesOf(opened).length === 1,
        'the removed worktree to be left out',
      );
      held.open();
      await opened.view.idle();
      assert.strictEqual(worktreesOf(opened).length, 1);
    } finally {
      opened.connection.dispose();
    }
  });

  test('forgets what it kept of a worktree once it is removed, stopping what it read for it, as its history and patches stayed until the tab closed', async () => {
    const own = await tempRepository(path.join(folder, 'forgotten'));
    await own.commit('a');
    const linked = path.join(folder, 'forgotten.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '--detach', linked);
    const opened = await openView(log, [own.root], { watched: true });
    try {
      const linkedRoot = worktreeRoot(opened, linked);
      await opened.connection.receive({
        type: 'selectWorktree',
        root: linkedRoot,
      });
      await opened.connection.receive({
        type: 'selectWorktree',
        root: own.root,
      });
      const tabStates: unknown = Reflect.get(opened.view, 'tabStates');
      assert.ok(tabStates instanceof Map);
      const kept: unknown = tabStates.get(linkedRoot);
      assert.ok(
        typeof kept === 'object' &&
          kept !== null &&
          'closed' in kept &&
          kept.closed instanceof AbortController,
      );
      await own.git('worktree', 'remove', '--force', linked);
      await waitFor(
        () => !tabStates.has(linkedRoot),
        'the removed worktree to be forgotten',
      );
      assert.strictEqual(kept.closed.signal.aborted, true);
      assert.ok(tabStates.has(own.root));
    } finally {
      opened.connection.dispose();
    }
  });

  test('offers a recent repository again once a worktree at its folder is removed, as it stayed hidden as one of the open tab', async () => {
    const own = await tempRepository(path.join(folder, 'reused'));
    await own.commit('a');
    const linked = path.join(folder, 'reused.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '--detach', linked);
    const opened = await openView(log, [own.root], { watched: true });
    try {
      const linkedRoot = worktreeRoot(opened, linked);
      await gitState(opened.store).update(recentKey, [linkedRoot]);
      await opened.connection.receive({
        type: 'moveTab',
        tab: 'nowhere',
        index: 0,
      });
      assert.deepStrictEqual(shownTabs(opened.page)?.recent, []);
      await own.git('worktree', 'remove', '--force', linked);
      await waitFor(
        () => worktreesOf(opened).length === 1,
        'the removed worktree to be left out',
      );
      await opened.connection.receive({
        type: 'moveTab',
        tab: 'nowhere',
        index: 0,
      });
      assert.deepStrictEqual(
        shownTabs(opened.page)?.recent.map((recent) => recent.root),
        [linkedRoot],
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('lists the worktrees again once its watcher has started when starting took longer than a change waits to be told, as a worktree removed meanwhile went on showing', async () => {
    const own = await tempRepository(path.join(folder, 'slow-watched'));
    await own.commit('a');
    const linked = path.join(folder, 'slow-watched.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '--detach', linked);
    const started = gate();
    const opened = await openView(log, [own.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      await started.opened;
      return original(...args);
    });
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => worktreesOf(opened).length === 2,
        'the worktrees to be listed',
      );
      await own.git('worktree', 'remove', '--force', linked);
      await new Promise((resolve) => setTimeout(resolve, 150));
      started.open();
      await ready;
      await waitFor(
        () => worktreesOf(opened).length === 1,
        'the worktree removed while the watcher started to be left out',
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('keeps showing the worktrees listed last when listing them again fails', async () => {
    const own = await tempRepository(path.join(folder, 'unlisted'));
    await own.commit('a');
    const linked = path.join(folder, 'unlisted.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '--detach', linked);
    const opened = await openView(log, [own.root], { watched: true });
    let failed = false;
    stubMethod(opened.view, 'worktreesOf', () => {
      failed = true;
      return Promise.reject(new Error('fatal: unable to read worktrees'));
    });
    stubMethod(opened.view, 'refresh', () => Promise.resolve());
    try {
      assert.strictEqual(worktreesOf(opened).length, 2);
      opened.page.clear();
      await own.git('-C', linked, 'switch', '-q', '-c', 'switched');
      await waitFor(() => failed, 'the worktrees to be listed again');
      await opened.view.idle();
      assert.strictEqual(shownTabs(opened.page), undefined);
      opened.connection.dispose();
      const reloaded = reopen(opened.view);
      await reloaded.ready;
      assert.strictEqual(shownTabs(reloaded.page)?.worktrees?.length, 2);
      reloaded.connection.dispose();
      takeErrorsLogged(
        logged,
        /^Listing the worktrees of .* failed$/,
        /^fatal: unable to read worktrees$/,
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('opens a folder in a linked worktree in the tab of its repository, listing its worktrees with the main one first', async () => {
    const host = new FakeHost();
    const inner = path.join(feature, 'inner');
    fs.mkdirSync(inner, { recursive: true });
    host.folders = [inner];
    await withView(
      log,
      [other],
      async (view) => {
        await view.connection.receive({ type: 'browseRepositories' });
        const shown = shownTabs(view.page);
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['other', 'app'],
        );
        assert.ok(sameRealFolder(shown.active, repository.root));
        assert.strictEqual(shown.worktree, feature);
        assert.deepStrictEqual(
          shown.worktrees?.map((worktree) => ({
            name: worktree.name,
            folder: worktree.folder,
            main: worktree.main,
            missing: worktree.missing,
          })),
          [
            { name: 'main', folder: 'app', main: true, missing: false },
            {
              name: 'feature',
              folder: 'feature',
              main: false,
              missing: false,
            },
            { name: 'gone', folder: 'gone', main: false, missing: true },
            {
              name: shortHash(reviewHead),
              folder: 'review',
              main: false,
              missing: false,
            },
          ],
        );
        assert.strictEqual(view.page.last('repository')?.head, 'feature');
      },
      true,
      host,
    );
  });

  test('opens the main worktree of a tab picked by another path to its folder as that main worktree, not a linked one', async () => {
    const link = path.join(folder, 'app.link');
    fs.symlinkSync(repository.root, link, 'junction');
    const host = new FakeHost();
    host.folders = [link];
    try {
      await withView(
        log,
        [repository.root, other],
        async (view) => {
          await view.connection.receive({ type: 'browseRepositories' });
          const shown = shownTabs(view.page);
          assert.deepStrictEqual(
            shown?.tabs.map((tab) => tab.name),
            ['app', 'other'],
          );
          assert.strictEqual(shown.active, repository.root);
          assert.strictEqual(shown.worktree, repository.root);
          assert.strictEqual(shown.worktrees?.[0]?.root, repository.root);
          assert.deepStrictEqual(gitState(view.store).get(worktreesKey), {});
        },
        true,
        host,
      );
    } finally {
      fs.rmSync(link);
    }
  });

  test('switches between the worktrees of a tab, coming back to the one shown last', async () => {
    await withView(log, [repository.root, other], async (view) => {
      assert.strictEqual(view.page.last('repository')?.head, 'main');
      assert.strictEqual(worktreesOf(view)[0].root, repository.root);
      const root = worktreeRoot(view, review);
      await view.connection.receive({ type: 'selectWorktree', root });
      assert.strictEqual(shownTabs(view.page)?.worktree, root);
      assert.strictEqual(view.page.last('repository')?.head, undefined);
      assert.strictEqual(view.page.last('repository')?.headCommit, reviewHead);
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, other),
      });
      assert.strictEqual(worktreesOf(view).length, 1);
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, repository.root),
      });
      assert.strictEqual(shownTabs(view.page)?.worktree, root);
      assert.strictEqual(worktreesOf(view).length, 4);
      assert.strictEqual(view.page.last('repository')?.headCommit, reviewHead);
    });
  });

  test('offers the worktree a tab shows to the other tools, not the main one', async () => {
    await withView(log, [repository.root, other], async (view) => {
      const root = worktreeRoot(view, review);
      await view.connection.receive({ type: 'selectWorktree', root });
      await view.connection.receive({ type: 'openIn' });
      assert.deepStrictEqual(view.page.last('chooseTool'), {
        type: 'chooseTool',
        folders: [root],
        choices: [
          { tool: 'terminal', fits: true },
          { tool: 'commander', fits: true },
          { tool: 'git', fits: false },
        ],
        picked: 'commander',
      });
    });
  });

  test('closes the tab of a repository while it shows another worktree', async () => {
    await withView(log, [repository.root, other], async (view) => {
      const root = worktreeRoot(view, review);
      await view.connection.receive({ type: 'selectWorktree', root });
      await view.connection.receive({
        type: 'closeTab',
        tab: tabOf(view.page, repository.root),
      });
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.root),
        [other],
      );
      assert.strictEqual(shownTabs(view.page)?.active, other);
    });
  });

  test('says the worktrees of a tab opened are still being listed until git lists them', async () => {
    await withView(log, [other, repository.root], async (view) => {
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, repository.root),
      });
      const sent = view.page.messages.flatMap((message) =>
        message.type === 'worktrees' ? [message.worktrees] : [],
      );
      assert.strictEqual(sent[0], undefined);
      assert.strictEqual(sent.at(-1)?.length, 4);
    });
  });

  test('lists the worktrees of a tab pointed at, so they show as soon as it is clicked', async () => {
    await withView(log, [other, repository.root], async (view) => {
      await view.connection.receive({
        type: 'preloadTab',
        tab: tabOf(view.page, repository.root),
      });
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, repository.root),
      });
      assert.strictEqual(
        view.page.messages.find((message) => message.type === 'worktrees')
          ?.worktrees?.length,
        4,
      );
    });
  });

  test('preloads a worktree pointed at, which then opens as it was left', async () => {
    await withView(log, [repository.root], async (view) => {
      const root = worktreeRoot(view, feature);
      await view.connection.receive({ type: 'preloadWorktree', root });
      assert.strictEqual(view.page.last('repository')?.head, 'main');
      let listed = 0;
      stubMethod(view.view, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      view.page.clear();
      await view.connection.receive({ type: 'selectWorktree', root });
      assert.strictEqual(listed, 0);
      assert.strictEqual(commitsSent(view.page.messages), 1);
      assert.strictEqual(view.page.last('repository')?.head, 'feature');
    });
  });
});
