import * as assert from 'node:assert';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { worktreesKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import { tempRepository } from '../../../../helpers/repositories';
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
  gitState,
} from '../../../../helpers/harness';
import { worktreeRepositories, worktreeRoot } from './toolWorktreesFixtures';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git tool fetching worktrees', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let other: string;

  beforeAll(async () => {
    ({ folder, other } = await worktreeRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
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
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false fetch --progress --no-auto-maintenance --all --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
