import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { shortHash } from '../../../../../lib/shared/hashes';
import { plainOf } from '../../../../../lib/shared/sentences';
import { worktreesKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import {
  tempRepository,
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
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import {
  sameRealFolder,
  worktreesOf,
  worktreeRoot,
  worktreeRepositories,
} from './toolWorktreesFixtures';
import { FakeHost } from '../../../../helpers/fakeHost';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git tool of worktrees', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let feature: string;
  let other: string;
  let reviewHead: string;

  beforeAll(async () => {
    ({ folder, repository, feature, other, reviewHead } =
      await worktreeRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
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
        plainOf(view.page.last('error')?.message ?? ''),
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
      assert.match(plainOf(shown ?? ''), /is not a git repository/);
      await view.view.idle();
      fs.renameSync(moved, linked);
      await own.git('branch', 'back');
      await waitFor(
        () => view.page.last('clearError') !== undefined,
        'the refresh to succeed',
      );
      assert.deepStrictEqual(view.page.last('clearError')?.message, shown);
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
          plainOf(view.page.last('error')?.message ?? ''),
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
      assert.match(plainOf(shown ?? ''), /is not a git repository/);
      await view.view.idle();
      fs.renameSync(moved, linked);
      await view.connection.receive({ type: 'selectWorktree', root: linked });
      assert.strictEqual(view.page.last('repository')?.head, 'linked');
      assert.deepStrictEqual(view.page.last('clearError')?.message, shown);
    } finally {
      view.connection.dispose();
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
});
