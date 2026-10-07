import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import type { ToWebviewOf } from '../shared/protocol';
import { shortHash } from '../shared/hashes';
import { activeTabKey, bookmarksKey, worktreesKey } from '../storage';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  gate,
  idleOnlyOnceOpened,
  openView,
  stubMethod,
  takeErrorsLogged,
  withView,
  type OpenView,
} from './viewHarness';

function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

function worktreesOf(
  view: OpenView,
): NonNullable<ToWebviewOf<'tabs'>['worktrees']> {
  return view.page.last('tabs')?.worktrees ?? [];
}

function worktreeRoot(view: OpenView, root: string): string {
  const found = worktreesOf(view).find((worktree) =>
    sameRealFolder(worktree.root, root),
  );
  assert.ok(found, root);
  return found.root;
}

suite('View of worktrees', function () {
  this.timeout(30_000);
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let feature: string;
  let review: string;
  let other: string;
  let reviewHead: string;

  suiteSetup(async () => {
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

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('is idle only once it has listed the worktrees again for a change its watcher saw', async () => {
    const own = await tempRepository(path.join(folder, 'idle'));
    await own.commit('a');
    const opened = await openView(log, [own.root]);
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
        const shown = view.page.last('tabs');
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

  test('switches between the worktrees of a tab, coming back to the one shown last', async () => {
    await withView(log, [repository.root, other], async (view) => {
      assert.strictEqual(view.page.last('repository')?.head, 'main');
      assert.strictEqual(worktreesOf(view)[0].root, repository.root);
      const root = worktreeRoot(view, review);
      await view.connection.receive({ type: 'selectWorktree', root });
      assert.strictEqual(view.page.last('tabs')?.worktree, root);
      assert.strictEqual(view.page.last('repository')?.head, undefined);
      assert.strictEqual(view.page.last('repository')?.headCommit, reviewHead);
      await view.connection.receive({ type: 'selectTab', root: other });
      assert.strictEqual(worktreesOf(view).length, 1);
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.strictEqual(view.page.last('tabs')?.worktree, root);
      assert.strictEqual(worktreesOf(view).length, 4);
      assert.strictEqual(view.page.last('repository')?.headCommit, reviewHead);
    });
  });

  test('says the worktrees of a tab opened are still being listed until git lists them', async () => {
    await withView(log, [other, repository.root], async (view) => {
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      const sent = view.page.messages.flatMap((message) =>
        message.type === 'tabs' ? [message.worktrees] : [],
      );
      assert.strictEqual(sent[0], undefined);
      assert.strictEqual(sent.at(-1)?.length, 4);
    });
  });

  test('lists the worktrees of a tab pointed at, so they show as soon as it is clicked', async () => {
    await withView(log, [other, repository.root], async (view) => {
      await view.connection.receive({
        type: 'preloadTab',
        root: repository.root,
      });
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.strictEqual(
        view.page.messages.find((message) => message.type === 'tabs')?.worktrees
          ?.length,
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

  test('merges the tabs stored for the worktrees of a repository into its tab, keeping the one shown and the bookmarks of each', async () => {
    const view = await openView(
      log,
      [feature, other, review, repository.root],
      false,
    );
    try {
      await view.store.update(activeTabKey, review);
      await view.store.update(bookmarksKey, {
        [feature]: [{ kind: 'branch', name: 'feature' }],
        [repository.root]: [{ kind: 'branch', name: 'main' }],
      });
      await view.connection.receive({ type: 'ready' });
      const shown = view.page.last('tabs');
      assert.deepStrictEqual(
        shown?.tabs.map((tab) => tab.name),
        ['app', 'other'],
      );
      assert.strictEqual(shown.active, repository.root);
      assert.strictEqual(shown.worktree, review);
      assert.deepStrictEqual(
        view.page.last('bookmarks')?.bookmarks.map((bookmark) => bookmark.name),
        ['main', 'feature'],
      );
      assert.strictEqual(view.page.last('repository')?.headCommit, reviewHead);
    } finally {
      view.connection.dispose();
    }
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
        const shown = view.page.last('tabs');
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
          root: repository.root,
        });
        assert.deepStrictEqual(
          view.page.last('tabs')?.recent.map((recent) => recent.name),
          ['app'],
        );
        await view.connection.receive({
          type: 'openRepository',
          root: repository.root,
        });
        assert.strictEqual(view.page.last('tabs')?.worktree, root);
        assert.strictEqual(view.page.last('repository')?.head, 'feature');
        await view.connection.receive({ type: 'browseRepositories' });
        assert.strictEqual(view.page.last('tabs')?.worktree, repository.root);
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
      await view.store.update(worktreesKey, { [repository.root]: gone });
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

  test('updates the worktrees when another one switches branch', async () => {
    await withView(log, [repository.root], async (view) => {
      await repository.git('-C', review, 'switch', '-q', '-c', 'reviewing');
      try {
        await waitFor(
          () =>
            worktreesOf(view).some((worktree) => worktree.name === 'reviewing'),
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
    });
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
      });
      takeErrorsLogged(
        logged,
        /^fetch failed$/,
        /^git fetch --all --prune failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
