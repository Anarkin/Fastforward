import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type { GitToWebviewOf } from '../../../../../tools/git/shared/protocol';
import { shortHash } from '../../../../../tools/git/shared/hashes';
import { strings } from '../../../../../shared/strings';
import { recentKey, worktreesKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
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
  idleOnlyOnceOpened,
  openView,
  reopen,
  stubMethod,
  takeErrorsLogged,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../harness';

function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

function worktreesOf(
  view: OpenView,
): NonNullable<GitToWebviewOf<'worktrees'>['worktrees']> {
  return shownTabs(view.page)?.worktrees ?? [];
}

function worktreeRoot(view: OpenView, root: string): string {
  const found = worktreesOf(view).find((worktree) =>
    sameRealFolder(worktree.root, root),
  );
  assert.ok(found, root);
  return found.root;
}

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
      await opened.connection.receive({ type: 'sortTabs' });
      assert.deepStrictEqual(shownTabs(opened.page)?.recent, []);
      await own.git('worktree', 'remove', '--force', linked);
      await waitFor(
        () => worktreesOf(opened).length === 1,
        'the removed worktree to be left out',
      );
      await opened.connection.receive({ type: 'sortTabs' });
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

  test('opens a bare repository by the folder holding it at its first worktree, with no main worktree', async () => {
    const layout = path.join(folder, 'bare-layout');
    const bare = await tempRepository(path.join(layout, '.bare'), {
      bare: true,
    });
    fs.writeFileSync(path.join(layout, '.git'), 'gitdir: ./.bare\n');
    await repository.git('push', '-q', bare.root, 'main', 'feature');
    await bare.git('worktree', 'add', '-q', path.join(layout, 'main'), 'main');
    await bare.git(
      'worktree',
      'add',
      '-q',
      path.join(layout, 'feature'),
      'feature',
    );
    const host = new FakeHost();
    host.folders = [layout];
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'browseRepositories' });
        const shown = shownTabs(view.page);
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['bare-layout'],
        );
        assert.deepStrictEqual(
          shown.worktrees?.map(({ name, main }) => ({ name, main })),
          [
            { name: 'feature', main: false },
            { name: 'main', main: false },
          ],
        );
        assert.ok(sameRealFolder(shown.worktree, path.join(layout, 'feature')));
        assert.strictEqual(view.page.last('repository')?.head, 'feature');
      },
      true,
      host,
    );
  });

  test('keeps bookmarks to the repository and solo to the worktree', async () => {
    await withView(log, [repository.root], async (view) => {
      const root = worktreeRoot(view, feature);
      await view.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [{ kind: 'tag', name: 'x' }],
      });
      await view.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      await view.connection.receive({ type: 'selectWorktree', root });
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, [
        { kind: 'tag', name: 'x' },
      ]);
      assert.strictEqual(view.page.last('solo')?.solo, false);
      await view.connection.receive({
        type: 'setBookmarks',
        root,
        bookmarks: [{ kind: 'tag', name: 'y' }],
      });
      await view.connection.receive({
        type: 'selectWorktree',
        root: repository.root,
      });
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, [
        { kind: 'tag', name: 'y' },
      ]);
      assert.strictEqual(view.page.last('solo')?.solo, true);
    });
  });

  test('reopens a recent repository at the worktree shown last, but a folder picked at its own worktree', async () => {
    const host = new FakeHost();
    host.folders = [repository.root];
    await withView(
      log,
      [repository.root, other],
      async (view) => {
        const root = worktreeRoot(view, feature);
        await view.connection.receive({ type: 'selectWorktree', root });
        await view.connection.receive({
          type: 'closeTab',
          tab: tabOf(view.page, repository.root),
        });
        assert.deepStrictEqual(
          shownTabs(view.page)?.recent.map((recent) => recent.name),
          ['app'],
        );
        await view.connection.receive({
          type: 'openRepository',
          root: repository.root,
        });
        assert.strictEqual(shownTabs(view.page)?.worktree, root);
        assert.strictEqual(view.page.last('repository')?.head, 'feature');
        await view.connection.receive({ type: 'browseRepositories' });
        assert.strictEqual(shownTabs(view.page)?.worktree, repository.root);
        assert.strictEqual(view.page.last('repository')?.head, 'main');
      },
      true,
      host,
    );
  });

  test('says a worktree whose folder is gone is not a repository, still listing the worktrees to switch to', async () => {
    const view = await openView(log, [repository.root], false);
    try {
      const gone = path.join(folder, 'app.worktrees', 'gone');
      await gitState(view.store).update(worktreesKey, {
        [repository.root]: gone,
      });
      await view.connection.receive({ type: 'ready' });
      assert.match(
        view.page.last('error')?.message ?? '',
        /is not a git repository/,
      );
      assert.strictEqual(worktreesOf(view).length, 4);
      await view.connection.receive({
        type: 'selectWorktree',
        root: repository.root,
      });
      assert.strictEqual(view.page.last('repository')?.head, 'main');
    } finally {
      view.connection.dispose();
    }
  });

  test('takes back saying a worktree whose folder went away is not a repository once a refresh succeeds with it back', async () => {
    const own = await tempRepository(path.join(folder, 'away'));
    await own.commit('a');
    const linked = path.join(folder, 'away.worktrees', 'linked');
    const moved = `${linked}-moved`;
    await own.git('worktree', 'add', '-q', '-b', 'linked', linked);
    const view = await openView(log, [own.root], {
      ready: false,
      watched: true,
    });
    try {
      await gitState(view.store).update(worktreesKey, { [own.root]: linked });
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      fs.renameSync(linked, moved);
      await own.git('branch', 'while-away');
      await waitFor(
        () => view.page.last('error') !== undefined,
        'the refresh to fail',
      );
      const shown = view.page.last('error')?.message;
      assert.match(shown ?? '', /is not a git repository/);
      await view.view.idle();
      fs.renameSync(moved, linked);
      await own.git('branch', 'back');
      await waitFor(
        () => view.page.last('clearError') !== undefined,
        'the refresh to succeed',
      );
      assert.strictEqual(view.page.last('clearError')?.message, shown);
    } finally {
      view.connection.dispose();
    }
    takeErrorsLogged(
      logged,
      /^Refreshing the tab failed$/,
      /^git .* failed: spawn .* ENOENT$/,
    );
  });

  test('says a worktree whose folder is removed while shown is not a repository on each refresh that fails, rather than that git could not start', async () => {
    const own = await tempRepository(path.join(folder, 'deleted'));
    await own.commit('a');
    const linked = path.join(folder, 'deleted.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '-b', 'linked', linked);
    const view = await openView(log, [own.root], {
      ready: false,
      watched: true,
    });
    try {
      await gitState(view.store).update(worktreesKey, { [own.root]: linked });
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      removeFolder(linked);
      for (const branch of ['one', 'two']) {
        await view.view.idle();
        view.page.clear();
        await own.git('branch', branch);
        await waitFor(
          () => view.page.last('error') !== undefined,
          'the refresh to fail',
        );
        assert.match(
          view.page.last('error')?.message ?? '',
          /is not a git repository/,
        );
      }
    } finally {
      view.connection.dispose();
    }
    takeErrorsLogged(
      logged,
      /^Refreshing the tab failed$/,
      /^git .* failed: spawn .* ENOENT$/,
    );
  });

  test('opens the worktree shown again when it is clicked once its folder, missing as it opened, is back', async () => {
    const own = await tempRepository(path.join(folder, 'returning'));
    await own.commit('a');
    const linked = path.join(folder, 'returning.worktrees', 'linked');
    const moved = `${linked}-moved`;
    await own.git('worktree', 'add', '-q', '-b', 'linked', linked);
    fs.renameSync(linked, moved);
    const view = await openView(log, [own.root], false);
    try {
      await gitState(view.store).update(worktreesKey, { [own.root]: linked });
      await view.connection.receive({ type: 'ready' });
      const shown = view.page.last('error')?.message;
      assert.match(shown ?? '', /is not a git repository/);
      await view.view.idle();
      fs.renameSync(moved, linked);
      await view.connection.receive({ type: 'selectWorktree', root: linked });
      assert.strictEqual(view.page.last('repository')?.head, 'linked');
      assert.strictEqual(view.page.last('clearError')?.message, shown);
    } finally {
      view.connection.dispose();
    }
  });

  test('updates the worktrees when another one switches branch', async () => {
    await withView(
      log,
      [repository.root],
      async (view) => {
        await repository.git('-C', review, 'switch', '-q', '-c', 'reviewing');
        try {
          await waitFor(
            () =>
              worktreesOf(view).some(
                (worktree) => worktree.name === 'reviewing',
              ),
            'the branch switched to',
          );
        } finally {
          await repository.git(
            '-C',
            review,
            'switch',
            '-q',
            '--detach',
            reviewHead,
          );
          await repository.git('branch', '-D', 'reviewing');
        }
      },
      { watched: true },
    );
  });

  test('checks out in the worktree shown, leaving the main worktree on its branch', async () => {
    const own = await tempRepository(path.join(folder, 'checking-out'));
    await own.commit('a');
    await own.git('branch', 'target');
    const linked = path.join(folder, 'checking-out.worktrees', 'linked');
    await own.git('worktree', 'add', '-q', '-b', 'linked', linked);
    await withView(log, [own.root], async (view) => {
      const root = worktreeRoot(view, linked);
      await view.connection.receive({ type: 'selectWorktree', root });
      await view.connection.receive({
        type: 'checkout',
        root,
        target: { kind: 'branch', name: 'target' },
      });
      assert.strictEqual(view.page.last('repository')?.head, 'target');
    });
    assert.strictEqual(
      (await own.git('-C', linked, 'symbolic-ref', 'HEAD')).trim(),
      'refs/heads/target',
    );
    assert.strictEqual(
      (await own.git('symbolic-ref', 'HEAD')).trim(),
      'refs/heads/main',
    );
  });

  test('tells every worktree of a repository when it last fetched, as each worktree has a FETCH_HEAD of its own', async () => {
    const origin = await tempRepository(path.join(folder, 'fetched-origin'));
    await origin.commit('a');
    const fetched = await tempRepository(path.join(folder, 'fetched'));
    await fetched.commit('a');
    await fetched.git('remote', 'add', 'origin', origin.root);
    const linked = path.join(folder, 'fetched.worktrees', 'linked');
    await fetched.git('worktree', 'add', '-q', '--detach', linked);
    await withView(log, [fetched.root], async (view) => {
      const root = worktreeRoot(view, linked);
      await view.connection.receive({ type: 'selectWorktree', root });
      await view.connection.receive({ type: 'fetch', root });
      const succeeded = view.page.last('lastFetch')?.succeeded;
      assert.ok(succeeded);
      view.page.clear();
      await view.connection.receive({
        type: 'selectWorktree',
        root: fetched.root,
      });
      assert.strictEqual(view.page.last('lastFetch')?.succeeded, succeeded);
    });
  });

  test('fetches a repository in the background though the worktree its tab showed last is gone, also once the app starts again', async () => {
    const origin = await tempRepository(path.join(folder, 'removed-origin'));
    await origin.commit('a');
    const fetched = await tempRepository(path.join(folder, 'removed'));
    await fetched.commit('a');
    await fetched.git('remote', 'add', 'origin', origin.root);
    const linked = path.join(folder, 'removed.worktrees', 'linked');
    await fetched.git('worktree', 'add', '-q', '--detach', linked);
    const rounds: (() => void)[] = [];
    const timer = (run: () => void) => {
      rounds.push(run);
      return () => undefined;
    };
    const brought = async (message: string) => {
      await origin.commit(message);
      const [head] = await origin.resolve('main');
      return head;
    };
    const opened = await openView(
      log,
      [fetched.root, other],
      true,
      undefined,
      timer,
    );
    try {
      const root = worktreeRoot(opened, linked);
      await opened.connection.receive({ type: 'selectWorktree', root });
      await opened.connection.receive({
        type: 'selectTab',
        tab: tabOf(opened.page, other),
      });
      await fetched.git('worktree', 'remove', '--force', linked);
      const head = await brought('b');
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      assert.deepStrictEqual(await fetched.resolve('origin/main'), [head]);
    } finally {
      opened.connection.dispose();
    }
    const started = await openView(
      log,
      [other, fetched.root],
      false,
      undefined,
      timer,
    );
    try {
      await gitState(started.store).update(worktreesKey, {
        [fetched.root]: linked,
      });
      await started.connection.receive({ type: 'ready' });
      const head = await brought('c');
      await started.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 2, 'the next round to end');
      assert.deepStrictEqual(await fetched.resolve('origin/main'), [head]);
    } finally {
      started.connection.dispose();
    }
  });

  test('fetches a repository once at a time, also for two of its worktrees', async () => {
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
    const linked = path.join(folder, 'slow-remote.worktrees', 'linked');
    await slow.git('worktree', 'add', '-q', '--detach', linked);
    try {
      await withView(log, [slow.root], async (view) => {
        const first = view.connection.receive({
          type: 'fetch',
          root: slow.root,
        });
        await waitFor(() => requests === 1, 'the fetch to reach the remote');
        const root = worktreeRoot(view, linked);
        await view.connection.receive({ type: 'selectWorktree', root });
        const second = view.connection.receive({ type: 'fetch', root });
        released = true;
        for (const answer of waiting) {
          answer();
        }
        await Promise.all([first, second]);
        assert.strictEqual(requests, 1);
        assert.strictEqual(
          view.page.messages.filter((message) => message.type === 'notice')
            .length,
          1,
        );
      });
      assert.strictEqual(
        logged.filter((entry) => entry === strings.log.fetchFailed).length,
        1,
      );
      takeErrorsLogged(
        logged,
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false fetch --progress --all --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
