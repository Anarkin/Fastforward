import * as assert from 'node:assert';
import * as path from 'node:path';
import type { Connection } from '../view';
import { waitFor } from './fixtures';
import {
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  lockedRepository,
  openView,
  stubMethod,
  takeErrorsLogged,
  withNotices,
} from './viewHarness';

suite('View fetching', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let restoreEnv: () => void;

  function takeFetchFailures(reason: RegExp): void {
    takeErrorsLogged(
      logged,
      /^fetch failed$/,
      new RegExp(`^git fetch --all --prune failed: fatal: ${reason.source}`),
    );
  }

  suiteSetup(async () => {
    restoreEnv = savedEnv(['GCM_INTERACTIVE']);
    delete process.env.GCM_INTERACTIVE;
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(
      log,
      [repository.root],
      'unwatched',
    ));
  });

  suiteTeardown(async () => {
    restoreEnv();
    await closeViews();
    removeFolder(folder);
  });

  test('fetches every remote, dropping branches deleted there', async () => {
    const upstream = await tempRepository(path.join(folder, 'upstream'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'upstream', upstream.root);
    try {
      await repository.git('push', upstream.root, 'main:upstream-only');
      await remote.git('branch', 'short-lived', 'main');
      await connection.receive({ type: 'fetch', root: repository.root });
      const fetched =
        page.last('repository')?.refs.map((ref) => ref.name) ?? [];
      assert.ok(fetched.includes('origin/short-lived'));
      assert.ok(fetched.includes('upstream/upstream-only'));
      await remote.git('branch', '-D', 'short-lived');
      await connection.receive({ type: 'fetch', root: repository.root });
      assert.ok(
        page
          .last('repository')
          ?.refs.every((ref) => ref.name !== 'origin/short-lived'),
      );
      assert.strictEqual(page.last('fetching')?.running, false);
    } finally {
      await repository.git('remote', 'remove', 'upstream');
    }
  });

  test('tells the page when the repository of its tab last fetched and last failed to', async () => {
    const before = Date.now();
    await connection.receive({ type: 'fetch', root: repository.root });
    const succeeded = page.last('lastFetch')?.succeeded ?? 0;
    assert.ok(succeeded >= before && succeeded <= Date.now());

    const unreachable = await tempRepository(path.join(folder, 'unreachable'));
    await unreachable.commit('a');
    await unreachable.git(
      'remote',
      'add',
      'origin',
      path.join(folder, 'nowhere at all'),
    );
    const opened = await openView(
      log,
      [unreachable.root, repository.root],
      'unwatched',
    );
    try {
      assert.deepStrictEqual(opened.page.last('lastFetch'), {
        type: 'lastFetch',
      });
      await withNotices(opened.page, 'error', () =>
        opened.connection.receive({ type: 'fetch', root: unreachable.root }),
      );
      takeFetchFailures(/'.*' does not appear to be a git repository/);
      const failed = opened.page.last('lastFetch');
      assert.ok((failed?.failed ?? 0) >= succeeded);
      assert.strictEqual(failed?.succeeded, undefined);
      await opened.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.deepStrictEqual(opened.page.last('lastFetch'), {
        type: 'lastFetch',
      });
    } finally {
      opened.connection.dispose();
    }
  });

  test('says when a fetch asked for fails, even while a background fetch that keeps quiet runs', async () => {
    const failing = await tempRepository(path.join(folder, 'failing'));
    await failing.commit('a');
    await failing.git('remote', 'add', 'origin', path.join(folder, 'absent'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [failing.root],
      'unwatched',
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let asked: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (rounds.length === 1 && args[3] === false) {
        asked ??= opened.connection.receive({
          type: 'fetch',
          root: failing.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the first round');
        assert.strictEqual(messages.length, 1);
        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        await asked;
        assert.strictEqual(messages.length, 2);
        assert.match(messages[1] ?? '', /^Couldn't fetch./);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      opened.connection.dispose();
    }
  });

  test('says a fetch asked for failed after its tab was left, naming its repository', async () => {
    const left = await tempRepository(path.join(folder, 'left'));
    await left.commit('a');
    await left.git('remote', 'add', 'origin', path.join(folder, 'nowhere'));
    const opened = await openView(
      log,
      [left.root, repository.root],
      'unwatched',
    );
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      await opened.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      return original(...args);
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'fetch', root: left.root });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^left: Couldn't fetch\./);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      opened.connection.dispose();
    }
  });

  test('lets only a fetch asked for, not one in the background, ask for credentials', async () => {
    const {
      repository: locked,
      asked,
      close,
    } = await lockedRepository(path.join(folder, 'locked'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      'unwatched',
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      await opened.connection.receive({ type: 'fetch', root: locked.root });
      assert.deepStrictEqual(asked(), ['[never]', '[]']);
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('lets a fetch asked for while a background one runs ask for credentials, and says it failed once', async () => {
    const {
      repository: locked,
      asked,
      close,
    } = await lockedRepository(path.join(folder, 'joined'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      'unwatched',
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let manual: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] === false) {
        manual ??= opened.connection.receive({
          type: 'fetch',
          root: locked.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the round to end');
        await manual;
        assert.deepStrictEqual(asked(), ['[never]', '[]']);
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('says once that a fetch failed when a background one joins it', async () => {
    const { repository: locked, close } = await lockedRepository(
      path.join(folder, 'joining'),
    );
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      'unwatched',
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let background: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] !== false) {
        background ??= opened.connection.receive({
          type: 'setAutoFetch',
          on: true,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'fetch', root: locked.root });
        await background;
        await waitFor(() => rounds.length === 1, 'the round to end');
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('says so when a fetch fails, and stops fetching', async () => {
    await repository.git(
      'remote',
      'add',
      'broken',
      path.join(folder, 'missing'),
    );
    try {
      await withNotices(page, 'error', async (messages) => {
        page.clear();
        await connection.receive({ type: 'fetch', root: repository.root });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
        assert.strictEqual(page.last('fetching')?.running, false);
        assert.ok(page.last('workingTree'));
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      await repository.git('remote', 'remove', 'broken');
    }
  });
});
