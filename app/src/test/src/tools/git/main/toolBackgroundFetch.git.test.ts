import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  gate,
  idleOnlyOnceOpened,
  openView,
  rootOf,
  stubMethod,
  takeErrorsLogged,
  withNotices,
  tabOf,
} from '../../../../helpers/harness';

suite('Git tool fetching in the background', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let pusher: TempRepository;
  let first: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let restoreEnv: () => void;

  function takeFetchFailures(reason: RegExp): void {
    takeErrorsLogged(
      logged,
      /^Fetching every remote failed$/,
      new RegExp(
        `^git -c remote\\.origin\\.prune=true -c remote\\.origin\\.pruneTags=false fetch --progress --no-auto-maintenance --all --porcelain failed: fatal: ${reason.source}`,
      ),
    );
  }

  beforeAll(async () => {
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
    pusher = await tempRepository(path.join(folder, 'pusher'));
    await pusher.git('pull', remote.root, 'main');
    first = await tempRepository(path.join(folder, 'first'));
    await first.commit('first');
  });

  afterAll(async () => {
    restoreEnv();
    await closeViews();
    removeFolder(folder);
  });

  async function push(message: string, refspecs = ['main']): Promise<string> {
    await pusher.commit(message);
    await pusher.git('push', remote.root, ...refspecs);
    const [pushed] = await pusher.resolve('HEAD');
    return pushed;
  }

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

  test('fetches every open repository while pinned, telling of a failure once until one succeeds', async () => {
    const broken = await tempRepository(path.join(folder, 'broken'));
    await broken.commit('a');
    const missing = path.join(folder, 'missing');
    await broken.git('remote', 'add', 'origin', missing);
    await first.git('remote', 'add', 'origin', remote.root);
    const [head] = await remote.resolve('main');
    const rounds: (() => void)[] = [];
    const view = await openView(
      log,
      [broken.root, first.root],
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
        assert.deepStrictEqual(await first.resolve('origin/main'), [head]);
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^broken: Couldn't fetch\./);
        assert.strictEqual(view.page.last('fetching'), undefined);
        assert.strictEqual(view.settings.settings.tools.git.autoFetch, true);

        await view.connection.receive({
          type: 'closeTab',
          tab: tabOf(view.page, first.root),
        });
        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        assert.strictEqual(messages.length, 1);

        await tempRepository(missing, { bare: true });
        rounds[1]();
        await waitFor(() => rounds.length === 3, 'the third round');
        removeFolder(missing);
        rounds[2]();
        await waitFor(() => rounds.length === 4, 'the fourth round');
        assert.strictEqual(messages.length, 2);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      view.connection.dispose();
      await first.git('remote', 'remove', 'origin');
    }
  });

  test('keeps the selected commit, its files and diff, and the place in the list as a background fetch brings commits and branches', async () => {
    const [pushed] = await repository.resolve('HEAD');
    await repository.commit('kept', { 'kept.txt': 'kept\n' });
    const [kept] = await repository.resolve('HEAD');
    await push('newer', ['main:main', 'main:brand-new']);
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
        report: 1,
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
      assert.deepStrictEqual(commits?.scrollTarget, {
        index,
        offset: 7,
        report: 1,
      });
      assert.ok((commits?.total ?? 0) > before);
      for (const type of ['files', 'diff', 'fileContent', 'error'] as const) {
        assert.strictEqual(shown.last(type), undefined, type);
      }
    } finally {
      open.dispose();
      await repository.git('reset', '--hard', pushed);
    }
  });

  test('shows what a background fetch brought to a tab selected while it ran', async () => {
    const brought = await push('brought');
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
      if (rootOf(context) === repository.root) {
        await opened.connection.receive({
          type: 'selectTab',
          tab: tabOf(opened.page, repository.root),
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
    await push('unfetched');
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
          tab: tabOf(opened.page, repository.root),
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
    }
  });

  test('tells nothing of a background fetch failing for a tab closed while it ran', async () => {
    const closing = await tempRepository(path.join(folder, 'closing'));
    await closing.commit('a');
    await closing.git('remote', 'add', 'origin', path.join(folder, 'gone'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [first.root, closing.root],
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
          tab: tabOf(opened.page, closing.root),
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
