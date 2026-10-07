import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Connection } from '../view';
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
  failOnErrorsLogged,
  type FakePage,
  gate,
  idleOnlyOnceOpened,
  openView,
  rootOf,
  stubMethod,
  takeErrorsLogged,
  withNotices,
} from './viewHarness';

suite('View updating by itself', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  const interactive = process.env.GCM_INTERACTIVE;

  function takeFetchFailures(reason: RegExp): void {
    takeErrorsLogged(
      logged,
      /^fetch failed$/,
      new RegExp(`^git fetch --all --prune failed: fatal: ${reason.source}`),
    );
  }

  suiteSetup(async () => {
    delete process.env.GCM_INTERACTIVE;
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(log, [repository.root]));
  });

  suiteTeardown(async () => {
    if (interactive !== undefined) {
      process.env.GCM_INTERACTIVE = interactive;
    }
    await closeViews();
    removeFolder(folder);
  });

  test('updates by itself when a fetch brings new commits', async () => {
    const elsewhere = await tempRepository(path.join(folder, 'elsewhere'));
    await elsewhere.git('pull', remote.root, 'main');
    await elsewhere.commit('from elsewhere');
    await elsewhere.git('push', remote.root, 'main');
    const [fetched] = await elsewhere.resolve('HEAD');
    page.clear();
    try {
      await repository.git('fetch');
      await waitFor(
        () =>
          page
            .last('repository')
            ?.refs.some(
              (ref) => ref.name === 'origin/main' && ref.commit === fetched,
            ) === true && page.last('commits') !== undefined,
        'the fetched commit and the reloaded history',
      );
    } finally {
      await repository.git('merge', '--ff-only', 'origin/main');
      await connection.refresh();
    }
  });

  test('updates by itself when a file changes in the working tree', async () => {
    page.clear();
    fs.writeFileSync(path.join(repository.root, 'edited.txt'), 'edited\n');
    try {
      await waitFor(
        () => page.last('workingTree')?.files === 1,
        'the changed file to show',
      );
    } finally {
      fs.rmSync(path.join(repository.root, 'edited.txt'));
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('reads the refs again by itself only when the git folder changes', async () => {
    const opened = await openView(log, [repository.root]);
    let reads = 0;
    stubMethod(opened.view, 'refsOf', (original, ...args) => {
      reads++;
      return original(...args);
    });
    const file = path.join(repository.root, 'saved.txt');
    try {
      fs.writeFileSync(file, 'saved\n');
      await waitFor(
        () => opened.page.last('workingTree')?.files === 1,
        'the saved file to show',
      );
      assert.strictEqual(reads, 0);
      await repository.git('tag', 'watched');
      await waitFor(
        () =>
          opened.page
            .last('repository')
            ?.refs.some((ref) => ref.name === 'watched') === true,
        'the new tag',
      );
      assert.ok(reads > 0);
    } finally {
      opened.connection.dispose();
      fs.rmSync(file);
      await repository.git('update-ref', '-d', 'refs/tags/watched');
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('is idle only once a background fetch is done', async () => {
    const held = gate();
    const opened = await openView(
      log,
      [repository.root],
      true,
      undefined,
      () => () => undefined,
    );
    let fetching = false;
    stubMethod(opened.view, 'fetchInBackground', async () => {
      fetching = true;
      await held.opened;
    });
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => fetching, 'the background fetch');
      opened.connection.dispose();
      await idleOnlyOnceOpened(opened.view, held);
    } finally {
      opened.connection.dispose();
    }
  });

  test('updates by itself when a file changes in a submodule', async () => {
    const library = await tempRepository(path.join(folder, 'library'));
    await library.commit('library', { 'lib.c': 'lib\n' });
    const host = await tempRepository(path.join(folder, 'host'));
    await host.commit('host');
    await host.git(
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      library.root,
      'sub',
    );
    await host.git('commit', '-m', 'adds sub');
    const opened = await openView(log, [host.root]);
    try {
      await waitFor(
        () => opened.page.last('workingTree')?.files === 0,
        'the clean working tree',
      );
      opened.page.clear();
      fs.writeFileSync(path.join(host.root, 'sub', 'lib.c'), 'edited\n');
      await waitFor(
        () => opened.page.last('workingTree')?.files === 1,
        'the changed submodule to show',
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('keeps updating a tab opened again while the watcher of the closed one still starts', async () => {
    const second = await tempRepository(path.join(folder, 'second-watched'));
    await second.commit('second');
    const opened = await openView(log, [repository.root, second.root], false);
    const started: (() => void)[] = [];
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      const watcher = await original(...args);
      const held = gate();
      started.push(held.open);
      await held.opened;
      return watcher;
    });
    try {
      const handled = [opened.connection.receive({ type: 'ready' })];
      await waitFor(() => started.length === 1, 'the first watcher');
      handled.push(
        opened.connection.receive({ type: 'closeTab', root: repository.root }),
      );
      await waitFor(() => started.length === 2, "the next tab's watcher");
      handled.push(
        opened.connection.receive({
          type: 'openRepository',
          root: repository.root,
        }),
      );
      await waitFor(() => started.length === 3, "the reopened tab's watcher");
      for (const open of started) {
        open();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all(handled);
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the working tree',
      );
      opened.page.clear();
      fs.writeFileSync(path.join(repository.root, 'watched.txt'), 'new\n');
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the reopened tab to update',
      );
    } finally {
      opened.connection.dispose();
      fs.rmSync(path.join(repository.root, 'watched.txt'), { force: true });
    }
  });

  test('fetches every open repository while pinned, telling of a failure once until one succeeds', async () => {
    const broken = await tempRepository(path.join(folder, 'broken'));
    await broken.commit('a');
    await broken.git('remote', 'add', 'origin', path.join(folder, 'missing'));
    const pusher = await tempRepository(path.join(folder, 'pusher'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('pushed');
    await pusher.git('push', remote.root, 'main');
    const [pushed] = await pusher.resolve('HEAD');
    const rounds: (() => void)[] = [];
    const view = await openView(
      log,
      [broken.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    try {
      await withNotices(view.page, 'error', async (messages) => {
        await view.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the first round');
        assert.deepStrictEqual(await repository.resolve('origin/main'), [
          pushed,
        ]);
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^broken: Couldn't fetch\./);
        assert.strictEqual(view.page.last('fetching'), undefined);
        assert.strictEqual(view.settings.settings.autoFetch, true);

        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        assert.strictEqual(messages.length, 1);

        await broken.git('remote', 'set-url', 'origin', remote.root);
        rounds[1]();
        await waitFor(() => rounds.length === 3, 'the third round');
        await broken.git('remote', 'set-url', 'origin', folder);
        rounds[2]();
        await waitFor(() => rounds.length === 4, 'the fourth round');
        assert.strictEqual(messages.length, 2);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      view.connection.dispose();
    }
  });

  test('keeps the selected commit, its files and diff, and the place in the list as a background fetch brings commits and branches', async () => {
    await repository.commit('kept', { 'kept.txt': 'kept\n' });
    const [kept] = await repository.resolve('HEAD');
    const pusher = await tempRepository(path.join(folder, 'pusher-kept'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('newer');
    await pusher.git('push', remote.root, 'main:main', 'main:brand-new');
    const rounds: (() => void)[] = [];
    const view = await openView(
      log,
      [repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    const { page: shown, connection: open } = view;
    try {
      await open.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: kept,
      });
      await open.receive({
        type: 'selectFile',
        root: repository.root,
        hash: kept,
        path: 'kept.txt',
      });
      await open.receive({
        type: 'scrolled',
        root: repository.root,
        hash: kept,
        offset: 7,
      });
      assert.ok(shown.last('diff')?.patch.includes('+kept'));
      const before = shown.last('commits')?.total ?? 0;
      shown.clear();
      await open.receive({ type: 'setAutoFetch', on: true });
      await waitFor(
        () =>
          shown
            .last('repository')
            ?.refs.some((ref) => ref.name === 'origin/brand-new') === true &&
          shown.last('commits') !== undefined,
        'the fetched branch and the reloaded history',
      );
      await waitFor(() => rounds.length === 1, 'the round to end');
      const commits = shown.last('commits');
      const index = commits?.selectedIndex ?? -1;
      assert.strictEqual(
        commits?.commits[index - (commits?.start ?? 0)]?.hash,
        kept,
      );
      assert.deepStrictEqual(commits?.scrollTarget, { index, offset: 7 });
      assert.ok((commits?.total ?? 0) > before);
      for (const type of ['files', 'diff', 'fileContent', 'error'] as const) {
        assert.strictEqual(shown.last(type), undefined, type);
      }
    } finally {
      open.dispose();
    }
  });

  test('fetches the active repository first in the background', async () => {
    const first = await tempRepository(path.join(folder, 'first-in-strip'));
    await first.commit('first');
    const view = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      () => () => undefined,
    );
    const fetched: unknown[] = [];
    stubMethod(view.view, 'fetchInBackground', (_original, root) => {
      fetched.push(root);
      return Promise.resolve();
    });
    try {
      await view.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      await view.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => fetched.length === 2, 'the round');
      assert.deepStrictEqual(fetched, [repository.root, first.root]);
    } finally {
      view.connection.dispose();
    }
  });

  test('shows what a background fetch brought to a tab selected while it ran', async () => {
    const first = await tempRepository(path.join(folder, 'first-selected'));
    await first.commit('first');
    const pusher = await tempRepository(path.join(folder, 'pusher-selected'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('brought');
    await pusher.git('push', remote.root, 'main');
    const [brought] = await pusher.resolve('HEAD');
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'watch', () => Promise.resolve());
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (rootOf(context) === repository.root) {
        await opened.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
      }
      return original(...args);
    });
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      await waitFor(
        () =>
          opened.page
            .last('repository')
            ?.refs.some(
              (ref) => ref.name === 'origin/main' && ref.commit === brought,
            ) === true,
        'the fetched branch',
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('leaves a tab closed during a background round unfetched', async () => {
    const first = await tempRepository(path.join(folder, 'first-closed'));
    await first.commit('first');
    const pusher = await tempRepository(path.join(folder, 'pusher-closed'));
    await pusher.git('pull', remote.root, 'main');
    await pusher.commit('unfetched');
    await pusher.git('push', remote.root, 'main');
    const [before] = await repository.resolve('origin/main');
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [first.root, repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (rootOf(context) === first.root) {
        await opened.connection.receive({
          type: 'closeTab',
          root: repository.root,
        });
      }
      return original(...args);
    });
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      assert.deepStrictEqual(await repository.resolve('origin/main'), [before]);
    } finally {
      opened.connection.dispose();
      await repository.git('fetch');
    }
  });

  test('tells nothing of a background fetch failing for a tab closed while it ran', async () => {
    const closing = await tempRepository(path.join(folder, 'closing'));
    await closing.commit('a');
    await closing.git('remote', 'add', 'origin', path.join(folder, 'gone'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [repository.root, closing.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      const [context] = args;
      if (rootOf(context) === closing.root) {
        await opened.connection.receive({
          type: 'closeTab',
          root: closing.root,
        });
      }
      return original(...args);
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the round to end');
        assert.deepStrictEqual(messages, []);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      opened.connection.dispose();
    }
  });
});
